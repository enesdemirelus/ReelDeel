import { useSyncExternalStore } from "react";

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

export type RoomState = {
  config: RoomConfig;
  players: Player[];
  pool: PoolMovie[];
  youId: string;
  endsAt: number;
  started: boolean;
};

const LOBBY_SECONDS = 90;
const YOU_HOST_ID = "you-host";
const YOU_PLAYER_ID = "you-player";

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
  patch((s) => ({
    ...s,
    players: s.players.map((p) => (p.isYou ? { ...p, name } : p)),
  }));
}

export function startGame() {
  clearSim();
  patch((s) => ({ ...s, started: true }));
}

export function leaveRoom() {
  clearSim();
  state = null;
  emit();
}

export function useRoom(): RoomState | null {
  return useSyncExternalStore(subscribe, getSnapshot);
}
