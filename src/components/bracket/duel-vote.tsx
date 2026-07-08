import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";

import { posterUri } from "@/lib/tmdb";
import type { Movie } from "@/state/movie-selection";

const ACCENT = "#FF7A3C";
const TEAL = "#2FB3C4";
const DANGER = "#F87171";

type Side = "left" | "right";

function Countdown({ endsAt, frozen }: { endsAt: number; frozen: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const tickRef = useRef<number | null>(null);

  const remaining = frozen ? 0 : Math.max(0, endsAt - now);
  const secs = Math.ceil(remaining / 1000);
  const urgent = secs <= 3 && remaining > 0;

  const scale = useSharedValue(1);

  useEffect(() => {
    if (frozen) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [frozen]);

  useEffect(() => {
    if (secs <= 0) return;
    if (tickRef.current !== secs && secs <= 5) {
      tickRef.current = secs;
      Haptics.impactAsync(
        urgent ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
      );
      scale.value = withSequence(
        withSpring(1.14, { damping: 8, stiffness: 340 }),
        withSpring(1, { damping: 13, stiffness: 240 }),
      );
    }
  }, [secs, urgent, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={styles.timerWrap}>
      <Animated.Text
        style={[styles.timerNum, style, { color: urgent ? DANGER : "#FFFFFF" }]}
        allowFontScaling={false}
      >
        {secs}
      </Animated.Text>
      <Text style={styles.timerLabel}>
        {remaining > 0 ? "seconds left" : "time"}
      </Text>
    </View>
  );
}

function VoteCard({
  movie,
  side,
  picked,
  revealed,
  won,
  onPick,
}: {
  movie: Movie;
  side: Side;
  picked: boolean;
  revealed: boolean;
  won: boolean;
  onPick: () => void;
}) {
  const settle = useSharedValue(1);

  useEffect(() => {
    if (revealed) {
      settle.value = withSpring(won ? 1.04 : 0.92, {
        damping: 14,
        stiffness: 180,
      });
    }
  }, [revealed, won, settle]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: settle.value }],
  }));

  const uri = posterUri(movie.posterPath);
  const dimmed = revealed && !won;
  const accent = side === "left" ? ACCENT : TEAL;

  return (
    <Animated.View style={[styles.cardCol, cardStyle]}>
      <Pressable
        onPress={onPick}
        disabled={revealed}
        accessibilityRole="button"
        accessibilityLabel={`Vote for ${movie.title}${movie.year ? `, ${movie.year}` : ""}`}
        accessibilityState={{ selected: picked, disabled: revealed }}
        style={[
          styles.poster,
          picked && { borderColor: accent, borderWidth: 3 },
          won && { borderColor: accent, borderWidth: 3 },
          dimmed && styles.posterDim,
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.posterImg}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={styles.posterEmpty}>
            <SymbolView name="film" tintColor="rgba(255,255,255,0.5)" size={26} />
          </View>
        )}

        {picked && !revealed ? (
          <View style={[styles.pickTag, { backgroundColor: accent }]}>
            <Text style={styles.pickTagText}>YOUR PICK</Text>
          </View>
        ) : null}
      </Pressable>
      <Text style={styles.cardTitle} numberOfLines={1}>
        {movie.title}
      </Text>
      {movie.year ? <Text style={styles.cardYear}>{movie.year}</Text> : null}
    </Animated.View>
  );
}

export function DuelVote({
  left,
  right,
  label,
  counts,
  endsAt,
  myVote,
  revealed,
  winner,
  tiebreak,
  onVote,
  onDevSkip,
}: {
  left: Movie;
  right: Movie;
  label: string;
  counts: { left: number; right: number };
  endsAt: number;
  myVote: Side | null;
  revealed: boolean;
  winner: Side | null;
  tiebreak?: "flip" | "hold" | null;
  onVote: (side: Side) => void;
  onDevSkip?: () => void;
}) {
  const share = useSharedValue(0.5);

  const total = counts.left + counts.right;

  useEffect(() => {
    share.value = withSpring(total === 0 ? 0.5 : counts.left / total, {
      damping: 16,
      stiffness: 200,
    });
  }, [counts, total, share]);

  useEffect(() => {
    if (!revealed || !winner) return;
    const movie = winner === "left" ? left : right;
    AccessibilityInfo.announceForAccessibility(`${movie.title} wins this duel`);
  }, [revealed, winner, left, right]);

  const leftPct = total === 0 ? 50 : Math.round((counts.left / total) * 100);
  const winnerMovie = winner === "right" ? right : left;

  const onPick = (side: Side) => {
    if (revealed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onVote(side);
  };

  const leftBar = useAnimatedStyle(() => ({ flex: Math.max(0.001, share.value) }));
  const rightBar = useAnimatedStyle(() => ({
    flex: Math.max(0.001, 1 - share.value),
  }));

  return (
    <Animated.View entering={FadeIn.duration(280)} style={styles.root}>
      <Text style={styles.round}>{label}</Text>

      <Countdown endsAt={endsAt} frozen={revealed} />

      <View style={styles.arena}>
        <VoteCard
          movie={left}
          side="left"
          picked={myVote === "left"}
          revealed={revealed}
          won={revealed && winner === "left"}
          onPick={() => onPick("left")}
        />

        <View style={styles.vsBadge}>
          <Text style={styles.vsBadgeText}>VS</Text>
        </View>

        <VoteCard
          movie={right}
          side="right"
          picked={myVote === "right"}
          revealed={revealed}
          won={revealed && winner === "right"}
          onPick={() => onPick("right")}
        />
      </View>

      <View style={styles.tally}>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, leftBar, { backgroundColor: ACCENT }]} />
          <Animated.View style={[styles.barFill, rightBar, { backgroundColor: TEAL }]} />
        </View>
        <View style={styles.tallyRow}>
          <Text style={[styles.pct, { color: ACCENT }]}>
            {leftPct}% · {counts.left}
          </Text>
          <Text style={styles.tallyMid}>
            {total} {total === 1 ? "vote" : "votes"}
            {revealed ? " in" : ""}
          </Text>
          <Text style={[styles.pct, { color: TEAL }]}>
            {counts.right} · {100 - leftPct}%
          </Text>
        </View>
      </View>

      {revealed ? (
        <View style={styles.revealCol}>
          {tiebreak ? (
            <Animated.View entering={FadeIn.duration(240)} style={styles.tiebreakPill}>
              <SymbolView
                name={tiebreak === "flip" ? "arrow.triangle.2.circlepath" : "crown.fill"}
                tintColor="#FFD479"
                size={13}
                weight="bold"
              />
              <Text style={styles.tiebreakText}>
                {tiebreak === "flip" ? "TIE · COIN FLIP" : "TIE · KING HOLDS"}
              </Text>
            </Animated.View>
          ) : null}
          <Animated.View
            entering={FadeInUp.delay(100).springify().damping(16)}
            style={styles.advanceRow}
          >
            <SymbolView name="checkmark.circle.fill" tintColor={ACCENT} size={16} weight="bold" />
            <Text style={styles.advanceText} numberOfLines={1}>
              {winnerMovie.title} advances
            </Text>
          </Animated.View>
        </View>
      ) : (
        <Text style={styles.hint}>Tap a poster to cast your vote</Text>
      )}

      {__DEV__ && onDevSkip && !revealed ? (
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onDevSkip();
          }}
          style={styles.devSkip}
        >
          <Text style={styles.devSkipText}>Skip (dev)</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 22,
  },
  round: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 12,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.55)",
  },
  timerWrap: {
    alignItems: "center",
    gap: 2,
  },
  timerNum: {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: 64,
    lineHeight: 72,
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
  timerLabel: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 11,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.5)",
  },
  arena: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  cardCol: {
    flex: 1,
    alignItems: "center",
    gap: 10,
  },
  poster: {
    width: "100%",
    aspectRatio: 2 / 3,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  posterDim: {
    opacity: 0.42,
  },
  posterImg: {
    width: "100%",
    height: "100%",
  },
  posterEmpty: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  pickTag: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  pickTagText: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 9,
    letterSpacing: 1,
    color: "#0B0F14",
  },
  cardTitle: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 13,
    color: "#FFFFFF",
    textAlign: "center",
  },
  cardYear: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    marginTop: -4,
  },
  vsBadge: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(11,15,20,0.85)",
  },
  vsBadgeText: {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: 13,
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  tally: {
    width: "100%",
    gap: 10,
  },
  barTrack: {
    flexDirection: "row",
    height: 12,
    borderRadius: 999,
    overflow: "hidden",
    gap: 3,
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
  tallyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pct: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  tallyMid: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 11,
    letterSpacing: 0.5,
    color: "rgba(255,255,255,0.55)",
  },
  hint: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
  },
  revealCol: {
    alignItems: "center",
    gap: 10,
  },
  tiebreakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,212,121,0.5)",
    backgroundColor: "rgba(255,212,121,0.12)",
  },
  tiebreakText: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 10,
    letterSpacing: 1,
    color: "#FFD479",
  },
  advanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "90%",
  },
  advanceText: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 15,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  devSkip: {
    position: "absolute",
    bottom: 12,
    right: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(11,15,20,0.85)",
  },
  devSkipText: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 10,
    letterSpacing: 0.5,
    color: "rgba(255,255,255,0.6)",
  },
});
