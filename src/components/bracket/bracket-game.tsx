import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
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
import { markWinner } from "@/lib/history";
import { posterUri } from "@/lib/tmdb";
import type { Movie } from "@/state/movie-selection";
import {
  advanceAfterReveal,
  castVote,
  endRoom,
  openMatch,
  PLAYIN_MAX_SLOTS,
  REVEAL_MS,
  RESOLVE_GRACE_MS,
  resolveCurrent,
  transferHostAndLeave,
  useRoom,
} from "@/state/room";

type Phase = "seeding" | "intro" | "focus" | "voting" | "advance" | "done";

const INTRO_MS = 1300;
const FOCUS_MS = 820;
const ADVANCE_MS = 1200;

export function BracketGame({ pool, onExit }: { pool: Movie[]; onExit: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
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

  const bracketSize = game?.bracketSize ?? 0;
  const hasPlayIn = bracketSize > PLAYIN_MAX_SLOTS;
  const slotsForStep = (step: number): number => {
    const entry = game?.playlist[step];
    return entry ? bracketSize / 2 ** entry[0] : 0;
  };
  const animIsPlayIn = hasPlayIn && slotsForStep(animStep) > PLAYIN_MAX_SLOTS;
  const sharedIsPlayIn = hasPlayIn && slotsForStep(sharedStep) > PLAYIN_MAX_SLOTS;

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
      Math.max(0, matchEndsAt + RESOLVE_GRACE_MS - Date.now()),
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
        const revealBracket = animIsPlayIn && !sharedIsPlayIn;
        const t = setTimeout(() => {
          setAnimStep(sharedStep);
          setPhase(revealBracket ? "seeding" : "focus");
        }, ADVANCE_MS);
        return () => clearTimeout(t);
      }
      if (sharedPhase === "done") {
        const t = setTimeout(() => setPhase("done"), ADVANCE_MS);
        return () => clearTimeout(t);
      }
    }
  }, [phase, sharedStep, sharedPhase, animStep, animIsPlayIn, sharedIsPlayIn]);

  useEffect(() => {
    if (phase !== "seeding" || !sharedIsPlayIn) return;
    const t = setTimeout(() => {
      setAnimStep(sharedStep);
      setPhase("focus");
    }, 0);
    return () => clearTimeout(t);
  }, [phase, sharedIsPlayIn, sharedStep]);

  useEffect(() => {
    if (phase !== "voting" || !animResolved) return;
    const t = setTimeout(() => setPhase("advance"), REVEAL_MS);
    return () => clearTimeout(t);
  }, [phase, animResolved]);

  useEffect(() => {
    if (sharedPhase !== "done" || !room || !game) return;
    const rounds = bracketRounds(
      game.seeds,
      game.playlist,
      game.roundCount,
      game.results,
    );
    const finalMu = rounds[game.roundCount - 1]?.[0];
    const champ: Slot = finalMu?.winner
      ? finalMu.winner === "a"
        ? finalMu.a
        : finalMu.b
      : null;
    if (champ?.title) {
      void markWinner(room.config.code, champ.title, champ.posterPath ?? null);
    }
  }, [sharedPhase, room, game]);

  const onSeeded = () => setPhase("intro");

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isHost) {
      Alert.alert(
        "Leave the game?",
        "You're the host. Hand the room to another player, or end it for everyone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Transfer host & leave",
            onPress: () => {
              void transferHostAndLeave();
              onExit();
            },
          },
          {
            text: "End room for everyone",
            style: "destructive",
            onPress: () => {
              void endRoom();
              onExit();
            },
          },
        ],
      );
      return;
    }
    Alert.alert(
      "Leave the game?",
      "You can rejoin with the code if the room is still open.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => onExit() },
      ],
    );
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

  const playInTotal = hasPlayIn
    ? playlist.filter(([r]) => bracketSize / 2 ** r > PLAYIN_MAX_SLOTS).length
    : 0;
  const playInDone = Math.min(animStep + 1, playInTotal);
  const playInLabel = `PLAY-IN — challenge ${playInDone} of ${playInTotal}`;

  const matchLabel = animIsPlayIn
    ? playInLabel
    : roundName(dr, rounds[dr]?.length ?? 0, di, roundCount);

  const label = done
    ? "Winner"
    : animIsPlayIn
      ? playInLabel
      : phase === "seeding"
        ? "Drawing the bracket…"
        : phase === "intro"
          ? "The bracket is set"
          : matchLabel;

  const championUri = champion ? posterUri(champion.posterPath) : null;

  return (
    <View style={styles.root}>
      <LavaBackdrop />

      {!animIsPlayIn ? (
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
      ) : null}

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
          {isHost ? (
            <View style={styles.footerStack}>
              <SpringButton
                onPress={() =>
                  router.push({ pathname: "/create", params: { rematch: "1" } })
                }
                style={styles.exit}
                accessibilityLabel="Play again"
              >
                <SymbolView name="arrow.clockwise" tintColor="#0B0F14" size={16} weight="bold" />
                <Text style={styles.exitText}>Play again</Text>
              </SpringButton>
              <SpringButton
                onPress={() => {
                  void endRoom();
                  onExit();
                }}
                style={styles.endRoom}
                accessibilityLabel="End room"
              >
                <Text style={styles.endRoomText}>End room</Text>
              </SpringButton>
            </View>
          ) : (
            <View style={styles.footerStack}>
              <View style={styles.waitPill}>
                <Text style={styles.waitText}>Waiting for the host…</Text>
              </View>
              <SpringButton onPress={onBack} style={styles.exit} accessibilityLabel="Back to home">
                <SymbolView name="house.fill" tintColor="#0B0F14" size={16} weight="bold" />
                <Text style={styles.exitText}>Back to home</Text>
              </SpringButton>
            </View>
          )}
        </View>
      ) : null}

      <SpringButton onPress={onBack} style={{ ...styles.backButton, top: insets.top + 12 }} accessibilityLabel="Leave game">
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
  footerStack: {
    alignItems: "center",
    gap: 12,
  },
  waitPill: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  waitText: {
    fontFamily: "Unbounded_600SemiBold",
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.5,
  },
  endRoom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 54,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,99,99,0.5)",
  },
  endRoomText: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 15,
    color: "#FFB3B3",
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
