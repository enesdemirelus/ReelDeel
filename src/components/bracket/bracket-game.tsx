import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BracketView, type Rounds } from "@/components/bracket/bracket-view";
import { DuelVote } from "@/components/bracket/duel-vote";
import { LavaBackdrop } from "@/components/lava-backdrop";
import { SpringButton } from "@/components/ui/spring-button";
import {
  bracketDuelAt,
  bracketRounds,
  roundName,
  type Slot,
  type Winner,
} from "@/lib/game";
import { posterUri } from "@/lib/tmdb";
import type { Movie } from "@/state/movie-selection";
import {
  advanceAfterReveal,
  castVote,
  openMatch,
  REVEAL_MS,
  resolveCurrent,
  useRoom,
} from "@/state/room";

type Phase = "seeding" | "intro" | "focus" | "voting" | "advance" | "done";

const INTRO_MS = 1300;
const FOCUS_MS = 820;
const ADVANCE_MS = 1200;

export function BracketGame({ pool, onExit }: { pool: Movie[]; onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const room = useRoom();
  const game = room?.game ?? null;
  const isHost = room?.config.role === "host";

  const [phase, setPhase] = useState<Phase>("seeding");
  const [animStep, setAnimStep] = useState(0);
  const openedRef = useRef(-1);

  const sharedStep = game?.step ?? 0;
  const sharedPhase = game?.phase ?? "playing";
  const started = phase !== "seeding" && phase !== "intro";
  const animResolved = game ? game.results[animStep] != null : false;
  const gamePhase = game?.phase ?? null;
  const sharedResolved = game ? game.results[game.step] != null : false;
  const matchEndsAt = game?.matchEndsAt ?? 0;
  const revealEndsAt = game?.revealEndsAt ?? 0;

  useEffect(() => {
    if (!isHost || !started || gamePhase !== "playing") return;
    if (sharedResolved) {
      const t = setTimeout(
        () => advanceAfterReveal(),
        Math.max(0, revealEndsAt - Date.now()),
      );
      return () => clearTimeout(t);
    }
    if (openedRef.current !== sharedStep) {
      openedRef.current = sharedStep;
      openMatch();
      return;
    }
    const t = setTimeout(
      () => resolveCurrent(),
      Math.max(0, matchEndsAt - Date.now()),
    );
    return () => clearTimeout(t);
  }, [isHost, started, gamePhase, sharedStep, sharedResolved, matchEndsAt, revealEndsAt]);

  useEffect(() => {
    if (phase === "intro") {
      const t = setTimeout(() => {
        setAnimStep(sharedStep);
        setPhase(sharedPhase === "done" ? "done" : "focus");
      }, INTRO_MS);
      return () => clearTimeout(t);
    }
    if (phase === "focus") {
      const t = setTimeout(() => setPhase("voting"), FOCUS_MS);
      return () => clearTimeout(t);
    }
    if (phase === "advance") {
      if (sharedStep > animStep) {
        const t = setTimeout(() => {
          setAnimStep(sharedStep);
          setPhase("focus");
        }, ADVANCE_MS);
        return () => clearTimeout(t);
      }
      if (sharedPhase === "done") {
        const t = setTimeout(() => setPhase("done"), ADVANCE_MS);
        return () => clearTimeout(t);
      }
    }
  }, [phase, sharedStep, sharedPhase, animStep]);

  useEffect(() => {
    if (phase !== "voting" || !animResolved) return;
    const t = setTimeout(() => setPhase("advance"), REVEAL_MS);
    return () => clearTimeout(t);
  }, [phase, animResolved]);

  const onSeeded = () => setPhase("intro");

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onExit();
  };

  if (!game) {
    return (
      <View style={styles.root}>
        <LavaBackdrop />
      </View>
    );
  }

  const { seeds, playlist, roundCount, results } = game;
  const rounds: Rounds = bracketRounds(seeds, playlist, roundCount, results);
  const [dr, di] = playlist[animStep] ?? [0, 0];
  const duel = bracketDuelAt(seeds, playlist, roundCount, results, animStep);
  const revealed = results[animStep] != null;
  const winner: Winner | null = results[animStep] ?? null;
  const done = phase === "done";

  const finalMu = rounds[roundCount - 1]?.[0];
  const champion: Slot = finalMu?.winner
    ? finalMu.winner === "a"
      ? finalMu.a
      : finalMu.b
    : null;

  const matchLabel = roundName(dr, rounds[dr]?.length ?? 0, di, roundCount);

  const label =
    phase === "seeding"
      ? "Drawing the bracket…"
      : phase === "intro"
        ? "The bracket is set"
        : done
          ? "Winner"
          : matchLabel;

  const championUri = champion ? posterUri(champion.posterPath) : null;

  return (
    <View style={styles.root}>
      <LavaBackdrop />

      <BracketView
        rounds={rounds}
        seeds={seeds}
        pool={pool}
        seeding={phase === "seeding"}
        focus={phase === "focus" || phase === "voting"}
        focusRound={dr}
        focusIndex={di}
        dim={phase === "voting"}
        onSeeded={onSeeded}
      />

      {phase !== "voting" && !done ? (
        <Animated.View
          key={label}
          entering={FadeIn.duration(320)}
          style={[styles.phaseLabel, { top: insets.top + 64 }]}
          pointerEvents="none"
        >
          <Text style={styles.phaseText}>{label}</Text>
        </Animated.View>
      ) : null}

      {phase === "voting" && duel.left && duel.right ? (
        <DuelVote
          key={animStep}
          left={duel.left}
          right={duel.right}
          label={matchLabel}
          counts={game.counts}
          endsAt={game.matchEndsAt}
          myVote={game.myVote}
          revealed={revealed}
          winner={winner}
          tiebreak={
            revealed && game.counts.left === game.counts.right ? "flip" : null
          }
          onVote={castVote}
          onDevSkip={isHost ? resolveCurrent : undefined}
        />
      ) : null}

      {done ? (
        <Animated.View
          entering={FadeIn.duration(360)}
          style={styles.winnerWrap}
          pointerEvents="box-none"
        >
          <View style={styles.crownRow}>
            <SymbolView name="crown.fill" tintColor="#FF7A3C" size={28} weight="semibold" />
          </View>
          <View style={styles.winnerPoster}>
            {championUri ? (
              <Image source={{ uri: championUri }} style={styles.winnerImg} contentFit="cover" />
            ) : (
              <View style={styles.winnerEmpty}>
                <SymbolView name="film" tintColor="rgba(255,255,255,0.4)" size={40} />
              </View>
            )}
          </View>
          <Text style={styles.winnerTitle} numberOfLines={2}>
            {champion ? champion.title : "Bracket complete"}
          </Text>
          <Text style={styles.winnerSub}>wins movie night</Text>
        </Animated.View>
      ) : null}

      {done ? (
        <View
          style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}
          pointerEvents="box-none"
        >
          <SpringButton onPress={onBack} style={styles.exit}>
            <SymbolView name="house.fill" tintColor="#0B0F14" size={16} weight="bold" />
            <Text style={styles.exitText}>Back to home</Text>
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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  winnerWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
    zIndex: 15,
  },
  crownRow: {
    alignItems: "center",
  },
  winnerPoster: {
    width: 168,
    height: 252,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FF7A3C",
    backgroundColor: "rgba(255,255,255,0.06)",
    shadowColor: "#FF7A3C",
    shadowOpacity: 0.4,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
  },
  winnerImg: {
    width: "100%",
    height: "100%",
  },
  winnerEmpty: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  winnerTitle: {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: 26,
    lineHeight: 34,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.4,
    marginTop: 6,
  },
  winnerSub: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    letterSpacing: 0.4,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    zIndex: 20,
  },
  exit: {
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
  exitText: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 15,
    color: "#0B0F14",
  },
});
