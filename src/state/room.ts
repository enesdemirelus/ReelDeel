import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { useSyncExternalStore } from "react";

import { db, ensureAuth } from "@/lib/firebase";
import { saveRoomVisit } from "@/lib/history";
import {
  bracketDuelAt,
  bracketPlaylist,
  buildBracket,
  buildKoth,
  byeWinner,
  isBye,
  resolveByesFrom,
  tallyWinner,
  type Slot,
  type Winner,
} from "@/lib/game";
import { type Movie, setSelection } from "@/state/movie-selection";

export type Mode = "bracket" | "koth";
export type Source = "players" | "host";
export type Role = "host" | "player";

export type Player = {
  id: string;
  name: string;
  isHost: boolean;
  isYou: boolean;
};

export type PoolMovie = Movie & { addedBy: string };

export type RoomConfig = {
  code: string;
  name: string;
  mode: Mode;
  source: Source;
  anonymous: boolean;
  perPlayer: number;
  role: Role;
};

export type StoredGame = {
  mode: Mode;
  seeds: Slot[];
  roundCount: number;
  bracketSize: number;
  challenges: number;
  results: Winner[];
  step: number;
  matchEndsAt: number;
  revealEndsAt?: number;
  phase: "playing" | "done";
};

export type GameState = StoredGame & {
  playlist: [number, number][];
  votes: Record<string, Winner>;
  myVote: Winner | null;
  counts: { left: number; right: number };
};

export type RoomState = {
  config: RoomConfig;
  players: Player[];
  pool: PoolMovie[];
  youId: string;
  endsAt: number;
  started: boolean;
  game: GameState | null;
};

const LOBBY_SECONDS = 90;
const VOTE_SECONDS = 10;
export const REVEAL_MS = 1600;
const HEARTBEAT_MS = 5000;
const HOST_STALE_MS = 20000;
const WRITE_RETRIES = 3;
const RETRY_MS = 1500;
export const RESOLVE_GRACE_MS = 750;
export const PLAYIN_SECONDS = 7;
export const PLAYIN_MAX_SLOTS = 8;
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const YOU_HOST_ID = "you-host";

function expireStamp(): Timestamp {
  return Timestamp.fromMillis(Date.now() + ROOM_TTL_MS);
}
const YOU_PLAYER_ID = "you-player";

type Kind = "local" | "live";

let kind: Kind = "local";
let state: RoomState | null = null;
const listeners = new Set<() => void>();
let simTimers: ReturnType<typeof setTimeout>[] = [];

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

function set(next: RoomState) {
  state = next;
  emit();
}

function patch(mut: (draft: RoomState) => RoomState) {
  if (!state) return;
  set(mut(state));
}

function clearSim() {
  for (const t of simTimers) clearTimeout(t);
  simTimers = [];
}

function later(fn: () => void, ms: number) {
  simTimers.push(setTimeout(fn, ms));
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(5);
  const cryptoObj = (
    globalThis as { crypto?: { getRandomValues?: (array: Uint32Array) => Uint32Array } }
  ).crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 0x100000000);
    }
  }
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

type RoomDoc = {
  code: string;
  name: string;
  mode: Mode;
  source: Source;
  anonymous: boolean;
  perPlayer: number;
  hostId: string;
  status: "lobby" | "started";
  endsAt: number;
  hostBeatAt?: Timestamp | null;
  game?: StoredGame | null;
};

type PlayerDoc = {
  id: string;
  name: string;
  joinedAt?: { seconds: number } | null;
};

type PoolDoc = {
  addedBy: string;
  movies: Movie[];
};

type VoteDoc = {
  step: number;
  uid: string;
  choice: Winner;
};

let liveCode: string | null = null;
let myUid: string | null = null;
let unsubs: (() => void)[] = [];
let roomDoc: RoomDoc | null = null;
let playerDocs: PlayerDoc[] = [];
let poolDocs: PoolDoc[] = [];
let voteDocs: VoteDoc[] = [];

function detachLive() {
  stopHostTimers();
  for (const u of unsubs) u();
  unsubs = [];
  roomDoc = null;
  playerDocs = [];
  poolDocs = [];
  voteDocs = [];
}

let beatTimer: ReturnType<typeof setInterval> | null = null;
let watchTimer: ReturnType<typeof setInterval> | null = null;

function stopHostTimers() {
  if (beatTimer) {
    clearInterval(beatTimer);
    beatTimer = null;
  }
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = null;
  }
}

function beat() {
  if (!isHostLive() || !liveCode) return;
  updateDoc(doc(db, "rooms", liveCode), {
    hostBeatAt: serverTimestamp(),
    expireAt: expireStamp(),
  }).catch(() => {});
}

async function maybeTakeover() {
  if (kind !== "live" || !liveCode || !myUid || !roomDoc) return;
  const currentBeat = roomDoc.hostBeatAt;
  if (!currentBeat) return;
  const hostId = roomDoc.hostId;
  const eligible = [...playerDocs]
    .filter((p) => p.id !== hostId)
    .sort((a, b) => (a.joinedAt?.seconds ?? 0) - (b.joinedAt?.seconds ?? 0));
  const rank = eligible.findIndex((p) => p.id === myUid);
  if (rank < 0) return;
  if (Date.now() - currentBeat.toMillis() < HOST_STALE_MS + rank * HEARTBEAT_MS) return;
  const code = liveCode;
  const uid = myUid;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(doc(db, "rooms", code));
      const data = snap.data() as RoomDoc | undefined;
      if (!data) return;
      const b = data.hostBeatAt;
      if (b && Date.now() - b.toMillis() < HOST_STALE_MS) return;
      tx.update(doc(db, "rooms", code), {
        hostId: uid,
        hostBeatAt: serverTimestamp(),
      });
    });
  } catch {}
}

function syncHostTimers() {
  if (isHostLive()) {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
    if (!beatTimer) {
      beat();
      beatTimer = setInterval(beat, HEARTBEAT_MS);
    }
    return;
  }
  if (beatTimer) {
    clearInterval(beatTimer);
    beatTimer = null;
  }
  if (kind === "live" && roomDoc && !watchTimer) {
    watchTimer = setInterval(maybeTakeover, HEARTBEAT_MS);
  }
}

function rebuildLive() {
  if (kind !== "live" || !roomDoc || !myUid) return;

  const hostId = roomDoc.hostId;
  const youId = myUid;

  const config: RoomConfig = {
    code: roomDoc.code,
    name: roomDoc.name,
    mode: roomDoc.mode,
    source: roomDoc.source,
    anonymous: roomDoc.anonymous,
    perPlayer: roomDoc.perPlayer,
    role: hostId === youId ? "host" : "player",
  };

  const players: Player[] = [...playerDocs]
    .sort((a, b) => (a.joinedAt?.seconds ?? 0) - (b.joinedAt?.seconds ?? 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.id === hostId,
      isYou: p.id === youId,
    }));

  const pool: PoolMovie[] = poolDocs
    .filter((d) => d.addedBy !== youId)
    .flatMap((d) => d.movies.map((m) => ({ ...m, addedBy: d.addedBy })));

  set({
    config,
    players,
    pool,
    youId,
    endsAt: roomDoc.endsAt,
    started: roomDoc.status === "started",
    game: deriveGame(roomDoc.game ?? null, youId),
  });
  syncHostTimers();
}

function deriveGame(g: StoredGame | null, youId: string): GameState | null {
  if (!g) return null;
  const votes: Record<string, Winner> = {};
  for (const v of voteDocs) if (v.step === g.step) votes[v.uid] = v.choice;
  let left = 0;
  let right = 0;
  for (const c of Object.values(votes)) {
    if (c === "left") left++;
    else right++;
  }
  const playlist =
    g.mode === "bracket" ? bracketPlaylist(g.bracketSize, g.roundCount) : [];
  return {
    ...g,
    playlist,
    votes,
    myVote: votes[youId] ?? null,
    counts: { left, right },
  };
}

function attachLive(code: string) {
  detachLive();

  unsubs.push(
    onSnapshot(doc(db, "rooms", code), (snap) => {
      if (!snap.exists() && kind === "live" && liveCode === code && roomDoc) {
        roomGone();
        return;
      }
      roomDoc = (snap.data() as RoomDoc | undefined) ?? null;
      rebuildLive();
    }),
  );
  unsubs.push(
    onSnapshot(collection(db, "rooms", code, "players"), (qs) => {
      playerDocs = qs.docs.map((d) => d.data() as PlayerDoc);
      rebuildLive();
    }),
  );
  unsubs.push(
    onSnapshot(collection(db, "rooms", code, "pool"), (qs) => {
      poolDocs = qs.docs.map((d) => d.data() as PoolDoc);
      rebuildLive();
    }),
  );
  unsubs.push(
    onSnapshot(collection(db, "rooms", code, "votes"), (qs) => {
      voteDocs = qs.docs.map((d) => d.data() as VoteDoc);
      rebuildLive();
    }),
  );
}

export async function roomExists(code: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "rooms", code.toUpperCase()));
  if (!snap.exists()) return false;
  return (snap.data() as RoomDoc).status !== "started";
}

export type CreateOptions = {
  name?: string;
  mode?: Mode;
  source?: Source;
  anonymous?: boolean;
  perPlayer?: number;
  lobbySeconds?: number;
  youName?: string;
  seedPool?: Movie[];
};

function clampLobbySeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return LOBBY_SECONDS;
  return Math.min(600, Math.max(15, Math.round(seconds)));
}

function normalizeName(raw: string | undefined, fallback: string, max = 24): string {
  const cleaned = (raw ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, max).trim() || fallback;
}

export async function createRoom(opts: CreateOptions): Promise<string> {
  clearSim();
  detachLive();

  const uid = await ensureAuth();
  const endsAt = Date.now() + clampLobbySeconds(opts.lobbySeconds ?? LOBBY_SECONDS) * 1000;
  const name = normalizeName(opts.youName, "You");

  const base = {
    name: normalizeName(opts.name, "Movie Night", 40),
    mode: opts.mode ?? "bracket",
    source: opts.source ?? "players",
    anonymous: opts.anonymous ?? false,
    perPlayer: opts.perPlayer ?? 3,
    hostId: uid,
    status: "lobby" as const,
    endsAt,
  };

  let record: RoomDoc | null = null;
  for (let attempt = 0; attempt < 8 && !record; attempt++) {
    const candidate = makeCode();
    const created = await runTransaction(db, async (tx) => {
      const ref = doc(db, "rooms", candidate);
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, {
        ...base,
        code: candidate,
        createdAt: serverTimestamp(),
        hostBeatAt: serverTimestamp(),
        expireAt: expireStamp(),
      });
      tx.set(doc(db, "rooms", candidate, "players", uid), {
        id: uid,
        name,
        joinedAt: serverTimestamp(),
        expireAt: expireStamp(),
      });
      return true;
    });
    if (created) record = { ...base, code: candidate };
  }
  if (!record) throw new Error("code-unavailable");

  void saveRoomVisit({ code: record.code, roomName: record.name, myName: name });

  kind = "live";
  myUid = uid;
  liveCode = record.code;

  setSelection(opts.seedPool ?? []);

  roomDoc = record;
  playerDocs = [{ id: uid, name }];
  poolDocs = [];
  rebuildLive();

  attachLive(record.code);
  return record.code;
}

export async function joinRoom(code: string, name: string): Promise<void> {
  clearSim();
  detachLive();

  const uid = await ensureAuth();
  const upper = code.toUpperCase();

  const snap = await getDoc(doc(db, "rooms", upper));
  const room = (snap.data() as RoomDoc | undefined) ?? null;
  if (!snap.exists() || !room || room.status !== "lobby") {
    throw new Error("room-unavailable");
  }

  kind = "live";
  myUid = uid;
  liveCode = upper;

  setSelection([]);

  const cleanName = normalizeName(name, "Player");
  await setDoc(doc(db, "rooms", upper, "players", uid), {
    id: uid,
    name: cleanName,
    joinedAt: serverTimestamp(),
    expireAt: expireStamp(),
  });

  void saveRoomVisit({ code: upper, roomName: room.name, myName: cleanName });

  roomDoc = room;
  playerDocs = [{ id: uid, name: cleanName }];
  poolDocs = [];
  rebuildLive();

  attachLive(upper);
}

export function syncMyMovies(movies: Movie[]) {
  if (kind !== "live" || !liveCode || !myUid) return;
  const ref = doc(db, "rooms", liveCode, "pool", myUid);
  if (movies.length > 0) {
    setDoc(ref, { addedBy: myUid, movies, expireAt: expireStamp() }).catch(() => {});
  } else {
    deleteDoc(ref).catch(() => {});
  }
}

const MOCK_MOVIES: Movie[] = [
  { id: 27205, title: "Inception", posterPath: "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg", year: "2010" },
  { id: 157336, title: "Interstellar", posterPath: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", year: "2014" },
  { id: 155, title: "The Dark Knight", posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", year: "2008" },
  { id: 496243, title: "Parasite", posterPath: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg", year: "2019" },
  { id: 680, title: "Pulp Fiction", posterPath: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg", year: "1994" },
  { id: 550, title: "Fight Club", posterPath: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg", year: "1999" },
  { id: 603, title: "The Matrix", posterPath: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg", year: "1999" },
  { id: 244786, title: "Whiplash", posterPath: "/7fn624j5lj3xTme2SgiLCeuedmO.jpg", year: "2014" },
  { id: 13, title: "Forrest Gump", posterPath: "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg", year: "1994" },
  { id: 129, title: "Spirited Away", posterPath: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg", year: "2001" },
];

const MOCK_NAMES = ["Maya", "Leo", "Priya", "Deniz", "Sam", "Zoe", "Kai", "Nora"];

let pid = 0;
function mkPlayer(name: string, isHost = false): Player {
  pid += 1;
  return { id: `p-${pid}`, name, isHost, isYou: false };
}

export type InitOptions = {
  role: Role;
  name?: string;
  mode?: Mode;
  source?: Source;
  anonymous?: boolean;
  perPlayer?: number;
  youName?: string;
  seedPool?: Movie[];
};

export function initRoom(opts: InitOptions) {
  clearSim();
  detachLive();
  kind = "local";
  myUid = null;
  liveCode = null;
  pid = 0;

  const config: RoomConfig = {
    code: makeCode(),
    name: opts.name?.trim() || "Movie Night",
    mode: opts.mode ?? "bracket",
    source: opts.source ?? "players",
    anonymous: opts.anonymous ?? false,
    perPlayer: opts.perPlayer ?? 3,
    role: opts.role,
  };

  const youId = opts.role === "host" ? YOU_HOST_ID : YOU_PLAYER_ID;
  const you: Player = {
    id: youId,
    name: opts.youName?.trim() || "You",
    isHost: opts.role === "host",
    isYou: true,
  };

  const host: Player = opts.role === "host" ? you : mkPlayer("Alex", true);
  const players: Player[] = opts.role === "host" ? [you] : [host, you];

  setSelection(opts.seedPool ?? []);

  set({
    config,
    players,
    pool: [],
    youId,
    endsAt: Date.now() + LOBBY_SECONDS * 1000,
    started: false,
    game: null,
  });

  scheduleSimulation(config);
}

function scheduleSimulation(config: RoomConfig) {
  const joiners = MOCK_NAMES.slice(0, config.role === "host" ? 4 : 3);

  if (config.role === "player") {
    patch((s) => {
      const other = mkPlayer(joiners[0]);
      const you = s.players.filter((p) => p.isYou);
      const rest = s.players.filter((p) => !p.isYou);
      return { ...s, players: [...rest, other, ...you] };
    });
  }

  joiners.forEach((name, i) => {
    if (config.role === "player" && i === 0) return;
    later(() => {
      patch((s) => {
        if (s.players.some((p) => p.name === name)) return s;
        const you = s.players.filter((p) => p.isYou);
        const rest = s.players.filter((p) => !p.isYou);
        return { ...s, players: [...rest, mkPlayer(name), ...you] };
      });
    }, 1400 + i * 1700);
  });

  if (config.source === "players") {
    const picks = MOCK_MOVIES.slice(0, 6);
    picks.forEach((movie, i) => {
      later(() => {
        patch((s) => {
          const others = s.players.filter((p) => !p.isYou && !p.isHost);
          const author = others[i % Math.max(others.length, 1)];
          if (!author) return s;
          if (s.pool.some((m) => m.id === movie.id)) return s;
          return { ...s, pool: [...s.pool, { ...movie, addedBy: author.id }] };
        });
      }, 2600 + i * 1500);
    });
  }
}

export function playerName(id: string): string {
  return state?.players.find((p) => p.id === id)?.name ?? "Someone";
}

export function setMyName(name: string) {
  if (kind === "live" && liveCode && myUid) {
    updateDoc(doc(db, "rooms", liveCode, "players", myUid), {
      name: normalizeName(name, "Player"),
    }).catch(() => {});
    return;
  }
  patch((s) => ({
    ...s,
    players: s.players.map((p) =>
      p.isYou ? { ...p, name: normalizeName(name, "Player") } : p,
    ),
  }));
}

function buildGame(mode: Mode, movies: Movie[]): StoredGame {
  const now = Date.now();
  if (mode === "koth") {
    const { seeds } = buildKoth(movies);
    return {
      mode: "koth",
      seeds,
      roundCount: 0,
      bracketSize: 0,
      challenges: Math.max(0, seeds.length - 1),
      results: [],
      step: 0,
      matchEndsAt: now + VOTE_SECONDS * 1000,
      phase: seeds.length > 1 ? "playing" : "done",
    };
  }
  const bracket = buildBracket(movies);
  const initial = resolveByesFrom(
    bracket.seeds,
    bracket.playlist,
    bracket.roundCount,
    [],
    0,
  );
  return {
    mode: "bracket",
    seeds: bracket.seeds,
    roundCount: bracket.roundCount,
    bracketSize: bracket.bracketSize,
    challenges: 0,
    results: initial.results,
    step: initial.step,
    matchEndsAt: now + VOTE_SECONDS * 1000,
    phase: initial.done ? "done" : "playing",
  };
}

function isHostLive(): boolean {
  return (
    kind === "live" &&
    !!liveCode &&
    !!roomDoc &&
    !!myUid &&
    roomDoc.hostId === myUid
  );
}

function scheduleRetry(attempt: number, run: () => void, label: string) {
  if (attempt < WRITE_RETRIES) {
    setTimeout(run, RETRY_MS * (attempt + 1));
  } else {
    console.warn(`write failed after retries: ${label}`);
  }
}

export function startGame(movies: Movie[]) {
  if (kind === "live" && liveCode) {
    startGameAttempt(movies, 0);
    return;
  }
  clearSim();
  patch((s) => ({ ...s, started: true }));
}

let startingGame = false;

function startGameAttempt(movies: Movie[], attempt: number) {
  if (!isHostLive() || !liveCode || roomDoc?.game || startingGame) return;
  startingGame = true;
  const unique = [...new Map(movies.map((m) => [m.id, m])).values()];
  const game = buildGame(roomDoc!.mode, unique);
  const code = liveCode;
  runTransaction(db, async (tx) => {
    const snap = await tx.get(doc(db, "rooms", code));
    const data = snap.data() as RoomDoc | undefined;
    if (!data || data.game) return;
    tx.update(doc(db, "rooms", code), { status: "started", game });
  })
    .then(() => {
      startingGame = false;
    })
    .catch(() => {
      startingGame = false;
      scheduleRetry(attempt, () => startGameAttempt(movies, attempt + 1), "startGame");
    });
}

export function castVote(choice: Winner) {
  if (kind !== "live" || !roomDoc?.game) return;
  castVoteAttempt(choice, roomDoc.game.step, 0);
}

function castVoteAttempt(choice: Winner, step: number, attempt: number) {
  if (kind !== "live" || !liveCode || !myUid || !roomDoc?.game) return;
  const g = roomDoc.game;
  if (g.phase !== "playing" || g.step !== step || g.results[step] != null) return;
  const uid = myUid;
  setDoc(doc(db, "rooms", liveCode, "votes", `${step}__${uid}`), {
    step,
    uid,
    choice,
    expireAt: expireStamp(),
  }).catch(() => {
    scheduleRetry(attempt, () => castVoteAttempt(choice, step, attempt + 1), "castVote");
  });
}

export function openMatch() {
  if (!roomDoc?.game) return;
  openMatchAttempt(roomDoc.game.step, 0);
}

function matchSeconds(g: StoredGame, step: number): number {
  if (g.mode !== "bracket" || g.bracketSize <= PLAYIN_MAX_SLOTS) return VOTE_SECONDS;
  const playlist = bracketPlaylist(g.bracketSize, g.roundCount);
  const entry = playlist[step];
  if (!entry) return VOTE_SECONDS;
  const slots = g.bracketSize / Math.pow(2, entry[0]);
  return slots > PLAYIN_MAX_SLOTS ? PLAYIN_SECONDS : VOTE_SECONDS;
}

function openMatchAttempt(step: number, attempt: number) {
  if (!isHostLive() || !roomDoc?.game || !liveCode) return;
  const g = roomDoc.game;
  if (g.phase !== "playing" || g.step !== step || g.results[step] != null) return;
  updateDoc(doc(db, "rooms", liveCode), {
    "game.matchEndsAt": Date.now() + matchSeconds(g, step) * 1000,
  }).catch(() => {
    scheduleRetry(attempt, () => openMatchAttempt(step, attempt + 1), "openMatch");
  });
}

async function freshVoteCounts(step: number): Promise<{ left: number; right: number }> {
  if (liveCode) {
    try {
      const qs = await getDocs(collection(db, "rooms", liveCode, "votes"));
      voteDocs = qs.docs.map((d) => d.data() as VoteDoc);
    } catch {}
  }
  const seen: Record<string, Winner> = {};
  for (const v of voteDocs) if (v.step === step) seen[v.uid] = v.choice;
  let left = 0;
  let right = 0;
  for (const c of Object.values(seen)) {
    if (c === "left") left++;
    else right++;
  }
  return { left, right };
}

export function resolveCurrent() {
  if (!roomDoc?.game) return;
  void resolveAttempt(roomDoc.game.step, 0);
}

async function resolveAttempt(step: number, attempt: number) {
  if (!isHostLive() || !roomDoc?.game || !liveCode) return;
  const g = roomDoc.game;
  if (g.phase !== "playing" || g.step !== step || g.results[step] != null) return;

  let winner: Winner;
  if (g.mode === "bracket") {
    const playlist = bracketPlaylist(g.bracketSize, g.roundCount);
    const duel = bracketDuelAt(g.seeds, playlist, g.roundCount, g.results, step);
    if (isBye(duel)) {
      winner = byeWinner(duel);
    } else {
      const counts = await freshVoteCounts(step);
      winner =
        counts.left === counts.right
          ? Math.random() < 0.5
            ? "left"
            : "right"
          : tallyWinner(counts);
    }
  } else {
    winner = tallyWinner(await freshVoteCounts(step));
  }

  const current = roomDoc?.game;
  if (
    !isHostLive() ||
    !liveCode ||
    !current ||
    current.phase !== "playing" ||
    current.step !== step ||
    current.results[step] != null
  ) {
    return;
  }

  const results = [...current.results];
  results[step] = winner;
  updateDoc(doc(db, "rooms", liveCode), {
    "game.results": results,
    "game.revealEndsAt": Date.now() + REVEAL_MS,
  }).catch(() => {
    scheduleRetry(attempt, () => resolveAttempt(step, attempt + 1), "resolveCurrent");
  });
}

export function advanceAfterReveal() {
  if (!roomDoc?.game) return;
  advanceAttempt(roomDoc.game.step, 0);
}

function advanceAttempt(step: number, attempt: number) {
  if (!isHostLive() || !roomDoc?.game || !liveCode) return;
  const g = roomDoc.game;
  if (g.phase !== "playing" || g.step !== step || g.results[step] == null) return;
  const retry = () =>
    scheduleRetry(attempt, () => advanceAttempt(step, attempt + 1), "advanceAfterReveal");

  if (g.mode === "bracket") {
    const playlist = bracketPlaylist(g.bracketSize, g.roundCount);
    const next = resolveByesFrom(
      g.seeds,
      playlist,
      g.roundCount,
      g.results,
      step + 1,
    );
    if (next.done) {
      updateDoc(doc(db, "rooms", liveCode), {
        "game.results": next.results,
        "game.phase": "done",
      }).catch(retry);
    } else {
      updateDoc(doc(db, "rooms", liveCode), {
        "game.results": next.results,
        "game.step": next.step,
      }).catch(retry);
    }
    return;
  }

  const nextStep = step + 1;
  if (nextStep >= g.challenges) {
    updateDoc(doc(db, "rooms", liveCode), { "game.phase": "done" }).catch(retry);
  } else {
    updateDoc(doc(db, "rooms", liveCode), { "game.step": nextStep }).catch(retry);
  }
}

function roomGone() {
  clearSim();
  detachLive();
  kind = "local";
  liveCode = null;
  myUid = null;
  state = null;
  emit();
}

export function leaveRoom() {
  clearSim();
  if (kind === "live" && liveCode && myUid) {
    deleteDoc(doc(db, "rooms", liveCode, "players", myUid)).catch(() => {});
    deleteDoc(doc(db, "rooms", liveCode, "pool", myUid)).catch(() => {});
  }
  roomGone();
}

export async function endRoom(): Promise<void> {
  if (!isHostLive() || !liveCode) return;
  const code = liveCode;
  const batch = writeBatch(db);
  for (const p of playerDocs) batch.delete(doc(db, "rooms", code, "players", p.id));
  for (const d of poolDocs) batch.delete(doc(db, "rooms", code, "pool", d.addedBy));
  for (const v of voteDocs)
    batch.delete(doc(db, "rooms", code, "votes", `${v.step}__${v.uid}`));
  batch.delete(doc(db, "rooms", code));
  try {
    await batch.commit();
  } catch {}
  roomGone();
}

export async function transferHostAndLeave(): Promise<void> {
  if (!isHostLive() || !liveCode || !myUid) {
    leaveRoom();
    return;
  }
  const successor = [...playerDocs]
    .filter((p) => p.id !== myUid)
    .sort((a, b) => (a.joinedAt?.seconds ?? 0) - (b.joinedAt?.seconds ?? 0))[0];
  if (!successor) {
    await endRoom();
    return;
  }
  try {
    await updateDoc(doc(db, "rooms", liveCode), {
      hostId: successor.id,
      hostBeatAt: serverTimestamp(),
      expireAt: expireStamp(),
    });
  } catch {}
  leaveRoom();
}

export type RematchOptions = {
  name?: string;
  mode?: Mode;
  source?: Source;
  anonymous?: boolean;
  perPlayer?: number;
  lobbySeconds?: number;
};

export async function rematchRoom(opts: RematchOptions): Promise<void> {
  if (!isHostLive() || !liveCode || !roomDoc) return;
  const code = liveCode;
  const batch = writeBatch(db);
  for (const v of voteDocs)
    batch.delete(doc(db, "rooms", code, "votes", `${v.step}__${v.uid}`));
  batch.update(doc(db, "rooms", code), {
    name: normalizeName(opts.name, roomDoc.name, 40),
    mode: opts.mode ?? roomDoc.mode,
    source: opts.source ?? roomDoc.source,
    anonymous: opts.anonymous ?? roomDoc.anonymous,
    perPlayer: opts.perPlayer ?? roomDoc.perPlayer,
    status: "lobby",
    game: deleteField(),
    endsAt: Date.now() + clampLobbySeconds(opts.lobbySeconds ?? LOBBY_SECONDS) * 1000,
    hostBeatAt: serverTimestamp(),
    expireAt: expireStamp(),
  });
  await batch.commit();
}

export function useRoom(): RoomState | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
