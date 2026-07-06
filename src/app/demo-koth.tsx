import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  type Challenger,
  type ChallengerState,
  KothView,
} from "@/components/bracket/koth-view";
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

const CHALLENGES = 7;

type Phase = "seeding" | "intro" | "focus" | "voting" | "advance" | "done";

function shuffle<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function makeDraw() {
  return { runId: Math.floor(Math.random() * 1e9), seeds: shuffle(POOL).slice(0, 8) };
}

export default function DemoKoth() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [draw, setDraw] = useState(makeDraw);
  const [king, setKing] = useState<Movie>(() => draw.seeds[0]);
  const [streak, setStreak] = useState(0);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>("seeding");

  useEffect(() => {
    if (phase === "intro") {
      const t = setTimeout(() => {
        setStep(0);
        setPhase("focus");
      }, 1300);
      return () => clearTimeout(t);
    }
    if (phase === "focus") {
      const t = setTimeout(() => setPhase("voting"), 760);
      return () => clearTimeout(t);
    }
    if (phase === "advance") {
      const t = setTimeout(() => {
        if (step + 1 < CHALLENGES) {
          setStep((s) => s + 1);
          setPhase("focus");
        } else {
          setPhase("done");
        }
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [phase, step]);

  const onSeeded = useCallback(() => setPhase("intro"), []);

  const challenger = draw.seeds[step + 1];

  const onResolved = useCallback(
    (winner: "left" | "right") => {
      if (winner === "right") {
        setKing(challenger);
        setStreak(1);
      } else {
        setStreak((s) => s + 1);
      }
      setPhase("advance");
    },
    [challenger],
  );

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const onRestart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = makeDraw();
    setDraw(next);
    setKing(next.seeds[0]);
    setStreak(0);
    setStep(0);
    setPhase("seeding");
  };

  const challengers: Challenger[] = draw.seeds.slice(1).map((movie, i) => {
    let state: ChallengerState;
    if (movie.id === king.id) state = "king";
    else if (i < step) state = "defeated";
    else if (i === step && phase !== "done") state = "current";
    else state = "upcoming";
    return { movie, state };
  });

  const label =
    phase === "seeding"
      ? "Setting the lineup…"
      : phase === "intro"
        ? "First challenger steps up"
        : phase === "done"
          ? `${king.title} rules the hill`
          : `CHALLENGE ${step + 1} OF ${CHALLENGES}`;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LavaBackdrop />

      <KothView
        key={draw.runId}
        king={king}
        streak={streak}
        challengers={challengers}
        seeds={draw.seeds}
        pool={POOL}
        seeding={phase === "seeding"}
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

      {phase === "voting" && challenger ? (
        <DuelVote
          key={`${draw.runId}-${step}`}
          left={king}
          right={challenger}
          label={`CHALLENGE ${step + 1} OF ${CHALLENGES}`}
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
        <Text style={styles.title}>King of the Hill</Text>
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
