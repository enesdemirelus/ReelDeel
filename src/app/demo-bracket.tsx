import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BracketView,
  type Rounds,
  type Side,
} from "@/components/bracket/bracket-view";
import { DuelVote } from "@/components/bracket/duel-vote";
import { LavaBackdrop } from "@/components/lava-backdrop";
import { SpringButton } from "@/components/ui/spring-button";
import type { Movie } from "@/state/movie-selection";

const POOL: Movie[] = [
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
  { id: 769, title: "GoodFellas", posterPath: "/aKuFiU82s5ISJpGZp7YkIr3kCUd.jpg", year: "1990" },
  { id: 238, title: "The Godfather", posterPath: "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg", year: "1972" },
];

const PLAYLIST: [number, number][] = [
  [0, 0],
  [0, 1],
  [0, 2],
  [0, 3],
  [1, 0],
  [1, 1],
  [2, 0],
];

type Phase = "seeding" | "intro" | "focus" | "voting" | "advance" | "done";

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeRounds(seeds: Movie[]): Rounds {
  const r0 = [0, 1, 2, 3].map((m) => ({
    a: seeds[m * 2],
    b: seeds[m * 2 + 1],
    winner: null,
  }));
  const r1 = [0, 1].map(() => ({ a: null, b: null, winner: null }));
  const r2 = [{ a: null, b: null, winner: null }];
  return [r0, r1, r2];
}

function resolve(rounds: Rounds, r: number, i: number, side: Side): Rounds {
  const next = rounds.map((round) => round.map((mu) => ({ ...mu })));
  const mu = next[r][i];
  mu.winner = side;
  const advancing = side === "a" ? mu.a : mu.b;
  if (r < 2) {
    const slot = i % 2 === 0 ? "a" : "b";
    next[r + 1][Math.floor(i / 2)][slot] = advancing;
  }
  return next;
}

function roundName(r: number, i: number): string {
  if (r === 0) return `QUARTERFINAL ${i + 1}`;
  if (r === 1) return `SEMIFINAL ${i + 1}`;
  return "FINAL";
}

function makeDraw() {
  return { runId: Math.floor(Math.random() * 1e9), seeds: shuffle(POOL).slice(0, 8) };
}

function LocalDuel({
  left,
  right,
  label,
  onResolved,
}: {
  left: Movie;
  right: Movie;
  label: string;
  onResolved: (winner: "left" | "right") => void;
}) {
  const [endsAt] = useState(() => Date.now() + 6000);
  const [counts, setCounts] = useState({ left: 0, right: 0 });
  const [myVote, setMyVote] = useState<"left" | "right" | null>(null);
  const [revealed, setRevealed] = useState(false);

  const winner: "left" | "right" = counts.right > counts.left ? "right" : "left";

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 6000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => onResolved(winner), 1600);
    return () => clearTimeout(t);
  }, [revealed, winner, onResolved]);

  const onVote = (side: "left" | "right") => {
    if (revealed || myVote === side) return;
    setMyVote(side);
    setCounts((c) => {
      const next = { ...c, [side]: c[side] + 1 };
      if (myVote) next[myVote] = Math.max(0, next[myVote] - 1);
      return next;
    });
  };

  return (
    <DuelVote
      left={left}
      right={right}
      label={label}
      counts={counts}
      endsAt={endsAt}
      myVote={myVote}
      revealed={revealed}
      winner={revealed ? winner : null}
      onVote={onVote}
    />
  );
}

export default function DemoBracket() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [draw, setDraw] = useState(makeDraw);
  const [rounds, setRounds] = useState<Rounds>(() => makeRounds(draw.seeds));
  const [phase, setPhase] = useState<Phase>("seeding");
  const [duelIndex, setDuelIndex] = useState(0);

  useEffect(() => {
    if (phase === "intro") {
      const t = setTimeout(() => {
        setDuelIndex(0);
        setPhase("focus");
      }, 1300);
      return () => clearTimeout(t);
    }
    if (phase === "focus") {
      const t = setTimeout(() => setPhase("voting"), 820);
      return () => clearTimeout(t);
    }
    if (phase === "advance") {
      const t = setTimeout(() => {
        if (duelIndex + 1 < PLAYLIST.length) {
          setDuelIndex((d) => d + 1);
          setPhase("focus");
        } else {
          setPhase("done");
        }
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [phase, duelIndex]);

  const onSeeded = useCallback(() => setPhase("intro"), []);

  const onResolved = useCallback(
    (winner: "left" | "right") => {
      const [r, i] = PLAYLIST[duelIndex];
      const side: Side = winner === "left" ? "a" : "b";
      setRounds((prev) => resolve(prev, r, i, side));
      setPhase("advance");
    },
    [duelIndex],
  );

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const onRestart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextDraw = makeDraw();
    setDraw(nextDraw);
    setRounds(makeRounds(nextDraw.seeds));
    setDuelIndex(0);
    setPhase("seeding");
  };

  const [dr, di] = PLAYLIST[duelIndex];
  const duel = rounds[dr][di];
  const champion = rounds[2][0].winner
    ? rounds[2][0].winner === "a"
      ? rounds[2][0].a
      : rounds[2][0].b
    : null;

  const label =
    phase === "seeding"
      ? "Drawing the bracket…"
      : phase === "intro"
        ? "The bracket is set"
        : phase === "done"
          ? champion
            ? `${champion.title} wins the night`
            : "Bracket complete"
          : roundName(dr, di);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LavaBackdrop />

      <BracketView
        key={draw.runId}
        rounds={rounds}
        seeds={draw.seeds}
        pool={POOL}
        seeding={phase === "seeding"}
        focus={phase === "focus" || phase === "voting"}
        focusRound={dr}
        focusIndex={di}
        dim={phase === "voting"}
        onSeeded={onSeeded}
      />

      {phase !== "voting" ? (
        <Animated.View
          key={label}
          entering={FadeIn.duration(320)}
          style={[styles.phaseLabel, { top: insets.top + 64 }]}
          pointerEvents="none"
        >
          <Text style={styles.phaseText}>{label}</Text>
        </Animated.View>
      ) : null}

      {phase === "voting" && duel.a && duel.b ? (
        <LocalDuel
          key={`${draw.runId}-${duelIndex}`}
          left={duel.a}
          right={duel.b}
          label={roundName(dr, di)}
          onResolved={onResolved}
        />
      ) : null}

      {phase === "done" ? (
        <View
          style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}
          pointerEvents="box-none"
        >
          <SpringButton onPress={onRestart} style={styles.again}>
            <SymbolView name="arrow.clockwise" tintColor="#0B0F14" size={16} weight="bold" />
            <Text style={styles.againText}>Run it again</Text>
          </SpringButton>
        </View>
      ) : null}

      <SpringButton onPress={onBack} style={{ ...styles.backButton, top: insets.top + 12 }}>
        <SymbolView name="chevron.left" tintColor="#FFFFFF" size={20} weight="semibold" />
      </SpringButton>

      <View style={[styles.titleBar, { top: insets.top + 18 }]} pointerEvents="none">
        <Text style={styles.title}>Bracket Duel</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#050E17",
  },
  backButton: {
    position: "absolute",
    left: 16,
    zIndex: 30,
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  titleBar: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  title: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  phaseLabel: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
    paddingHorizontal: 24,
  },
  phaseText: {
    fontFamily: "Unbounded_600SemiBold",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.5,
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    zIndex: 20,
  },
  again: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 54,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    shadowColor: "#FF7A3C",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  againText: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 15,
    color: "#0B0F14",
  },
});
