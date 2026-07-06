import type { Movie } from "@/state/movie-selection";

export type Winner = "left" | "right";
export type Slot = Movie | null;
export type GameSide = "a" | "b";
export type GameMatchup = { a: Slot; b: Slot; winner: GameSide | null };
export type GameRounds = GameMatchup[][];
export type Duel = { left: Slot; right: Slot };

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nextPow2(n: number): number {
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

function buildSeeds(pool: Movie[], bracketSize: number): Slot[] {
  const matchupCount = bracketSize / 2;
  const byes = Math.max(0, bracketSize - pool.length);
  const movies = shuffle(pool);
  const byeMatchups = new Set(
    shuffle(Array.from({ length: matchupCount }, (_, i) => i)).slice(0, byes),
  );
  const seeds: Slot[] = Array(bracketSize).fill(null);
  let m = 0;
  for (let mi = 0; mi < matchupCount; mi++) {
    if (byeMatchups.has(mi)) {
      const side = Math.random() < 0.5 ? 0 : 1;
      seeds[mi * 2 + side] = movies[m++] ?? null;
    } else {
      seeds[mi * 2] = movies[m++] ?? null;
      seeds[mi * 2 + 1] = movies[m++] ?? null;
    }
  }
  return seeds;
}

export function bracketPlaylist(
  bracketSize: number,
  roundCount: number,
): [number, number][] {
  const playlist: [number, number][] = [];
  for (let r = 0; r < roundCount; r++) {
    const n = bracketSize / 2 ** (r + 1);
    for (let i = 0; i < n; i++) playlist.push([r, i]);
  }
  return playlist;
}

export function buildBracket(pool: Movie[]): {
  seeds: Slot[];
  playlist: [number, number][];
  roundCount: number;
  bracketSize: number;
} {
  const bracketSize = Math.max(2, nextPow2(Math.max(2, pool.length)));
  const roundCount = Math.round(Math.log2(bracketSize));
  const seeds = buildSeeds(pool, bracketSize);
  const playlist = bracketPlaylist(bracketSize, roundCount);
  return { seeds, playlist, roundCount, bracketSize };
}

export function buildKoth(pool: Movie[]): { seeds: Movie[] } {
  return { seeds: shuffle(pool) };
}

function makeRounds(seeds: Slot[], roundCount: number): GameRounds {
  const r0Count = seeds.length / 2;
  const rounds: GameRounds = [
    Array.from({ length: r0Count }, (_, m) => ({
      a: seeds[m * 2],
      b: seeds[m * 2 + 1],
      winner: null,
    })),
  ];
  for (let r = 1; r < roundCount; r++) {
    const n = seeds.length / 2 ** (r + 1);
    rounds.push(
      Array.from({ length: n }, () => ({ a: null, b: null, winner: null })),
    );
  }
  return rounds;
}

function resolve(
  rounds: GameRounds,
  r: number,
  i: number,
  side: GameSide,
  roundCount: number,
): GameRounds {
  const next = rounds.map((round) => round.map((mu) => ({ ...mu })));
  const mu = next[r][i];
  mu.winner = side;
  const advancing = side === "a" ? mu.a : mu.b;
  if (r < roundCount - 1) {
    const slot = i % 2 === 0 ? "a" : "b";
    next[r + 1][Math.floor(i / 2)][slot] = advancing;
  }
  return next;
}

export function bracketRounds(
  seeds: Slot[],
  playlist: [number, number][],
  roundCount: number,
  results: Winner[],
): GameRounds {
  let rounds = makeRounds(seeds, roundCount);
  for (let step = 0; step < results.length; step++) {
    const [r, i] = playlist[step];
    const side: GameSide = results[step] === "left" ? "a" : "b";
    rounds = resolve(rounds, r, i, side, roundCount);
  }
  return rounds;
}

export function bracketDuelAt(
  seeds: Slot[],
  playlist: [number, number][],
  roundCount: number,
  results: Winner[],
  step: number,
): Duel {
  const rounds = bracketRounds(
    seeds,
    playlist,
    roundCount,
    results.slice(0, step),
  );
  const [r, i] = playlist[step];
  const mu = rounds[r][i];
  return { left: mu.a, right: mu.b };
}

export function isBye(duel: Duel): boolean {
  return !duel.left !== !duel.right;
}

export function byeWinner(duel: Duel): Winner {
  return duel.left ? "left" : "right";
}

export function resolveByesFrom(
  seeds: Slot[],
  playlist: [number, number][],
  roundCount: number,
  results: Winner[],
  fromStep: number,
): { results: Winner[]; step: number; done: boolean } {
  const res = [...results];
  let step = fromStep;
  while (step < playlist.length) {
    const duel = bracketDuelAt(seeds, playlist, roundCount, res, step);
    if (isBye(duel)) {
      res[step] = byeWinner(duel);
      step++;
    } else {
      break;
    }
  }
  return { results: res, step, done: step >= playlist.length };
}

export function kothStateAt(
  seeds: Movie[],
  results: Winner[],
  step: number,
): { king: Movie; challenger: Movie | undefined; streak: number } {
  let king = seeds[0];
  let streak = 0;
  for (let k = 0; k < step && k < results.length; k++) {
    if (results[k] === "right") {
      king = seeds[k + 1];
      streak = 1;
    } else {
      streak++;
    }
  }
  return { king, challenger: seeds[step + 1], streak };
}

export function roundName(
  r: number,
  matchups: number,
  i: number,
  roundCount: number,
): string {
  const fromEnd = roundCount - 1 - r;
  if (fromEnd === 0) return "FINAL";
  if (fromEnd === 1) return `SEMIFINAL ${i + 1}`;
  if (fromEnd === 2) return `QUARTERFINAL ${i + 1}`;
  return `ROUND OF ${matchups * 2} · ${i + 1}`;
}

export function tallyWinner(counts: { left: number; right: number }): Winner {
  return counts.right > counts.left ? "right" : "left";
}
