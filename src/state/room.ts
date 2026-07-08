import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useSyncExternalStore } from "react";

import { db, ensureAuth } from "@/lib/firebase";
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
const YOU_HOST_ID = "you-host";
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

let codeSeed = 7;
function makeCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 5; i++) {
    codeSeed = (codeSeed * 48271) % 0x7fffffff;
    out += alphabet[codeSeed % alphabet.length];
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
  for (const u of unsubs) u();
  unsubs = [];
  roomDoc = null;
  playerDocs = [];
  poolDocs = [];
  voteDocs = [];
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
}

function currentCounts(g: StoredGame): { left: number; right: number } {
  const seen: Record<string, Winner> = {};
  for (const v of voteDocs) if (v.step === g.step) seen[v.uid] = v.choice;
  let left = 0;
  let right = 0;
  for (const c of Object.values(seen)) {
    if (c === "left") left++;
    else right++;
  }
  return { left, right };
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

async function reserveCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = makeCode();
    const snap = await getDoc(doc(db, "rooms", candidate));
    if (!snap.exists()) return candidate;
  }
  return makeCode();
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
  const code = await reserveCode();
  const endsAt = Date.now() + clampLobbySeconds(opts.lobbySeconds ?? LOBBY_SECONDS) * 1000;
  const name = normalizeName(opts.youName, "You");

  kind = "live";
  myUid = uid;
  liveCode = code;

  const record: RoomDoc = {
    code,
    name: normalizeName(opts.name, "Movie Night", 40),
    mode: opts.mode ?? "bracket",
    source: opts.source ?? "players",
    anonymous: opts.anonymous ?? false,
    perPlayer: opts.perPlayer ?? 3,
    hostId: uid,
    status: "lobby",
    endsAt,
  };

  setSelection(opts.seedPool ?? []);

  roomDoc = record;
  playerDocs = [{ id: uid, name }];
  poolDocs = [];
  rebuildLive();

  await setDoc(doc(db, "rooms", code), {
    ...record,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(db, "rooms", code, "players", uid), {
    id: uid,
    name,
    joinedAt: serverTimestamp(),
  });

  attachLive(code);
  return code;
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
  });

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
    setDoc(ref, { addedBy: myUid, movies }).catch(() => {});
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

export function startGame(movies: Movie[]) {
  if (kind === "live" && liveCode) {
    if (!isHostLive() || roomDoc?.game) return;
    const game = buildGame(roomDoc!.mode, movies);
    updateDoc(doc(db, "rooms", liveCode), { status: "started", game }).catch(
      () => {},
    );
    return;
  }
  clearSim();
  patch((s) => ({ ...s, started: true }));
}

export function castVote(choice: Winner) {
  if (kind !== "live" || !liveCode || !myUid || !roomDoc?.game) return;
  const g = roomDoc.game;
  if (g.phase !== "playing" || g.results[g.step] != null) return;
  const step = g.step;
  setDoc(doc(db, "rooms", liveCode, "votes", `${step}__${myUid}`), {
    step,
    uid: myUid,
    choice,
  }).catch(() => {});
}

export function openMatch() {
  if (!isHostLive() || !roomDoc?.game || !liveCode) return;
  const g = roomDoc.game;
  if (g.phase !== "playing" || g.results[g.step] != null) return;
  updateDoc(doc(db, "rooms", liveCode), {
    "game.matchEndsAt": Date.now() + VOTE_SECONDS * 1000,
  }).catch(() => {});
}

export function resolveCurrent() {
  if (!isHostLive() || !roomDoc?.game || !liveCode) return;
  const g = roomDoc.game;
  if (g.phase !== "playing" || g.results[g.step] != null) return;
  const step = g.step;

  let winner: Winner;
  if (g.mode === "bracket") {
    const playlist = bracketPlaylist(g.bracketSize, g.roundCount);
    const duel = bracketDuelAt(g.seeds, playlist, g.roundCount, g.results, step);
    if (isBye(duel)) {
      winner = byeWinner(duel);
    } else {
      const counts = currentCounts(g);
      winner =
        counts.left === counts.right
          ? Math.random() < 0.5
            ? "left"
            : "right"
          : tallyWinner(counts);
    }
  } else {
    winner = tallyWinner(currentCounts(g));
  }

  const results = [...g.results];
  results[step] = winner;
  updateDoc(doc(db, "rooms", liveCode), { "game.results": results }).catch(
    () => {},
  );
}

export function advanceAfterReveal() {
  if (!isHostLive() || !roomDoc?.game || !liveCode) return;
  const g = roomDoc.game;
  if (g.phase !== "playing" || g.results[g.step] == null) return;
  const step = g.step;

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
      }).catch(() => {});
    } else {
      updateDoc(doc(db, "rooms", liveCode), {
        "game.results": next.results,
        "game.step": next.step,
      }).catch(() => {});
    }
    return;
  }

  const nextStep = step + 1;
  if (nextStep >= g.challenges) {
    updateDoc(doc(db, "rooms", liveCode), { "game.phase": "done" }).catch(
      () => {},
    );
  } else {
    updateDoc(doc(db, "rooms", liveCode), { "game.step": nextStep }).catch(
      () => {},
    );
  }
}

export function leaveRoom() {
  clearSim();
  if (kind === "live" && liveCode && myUid) {
    deleteDoc(doc(db, "rooms", liveCode, "players", myUid)).catch(() => {});
    deleteDoc(doc(db, "rooms", liveCode, "pool", myUid)).catch(() => {});
  }
  detachLive();
  kind = "local";
  liveCode = null;
  myUid = null;
  state = null;
  emit();
}

export function useRoom(): RoomState | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
