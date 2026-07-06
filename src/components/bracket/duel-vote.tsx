import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
const DURATION_MS = 2000;

type Side = "left" | "right";

const PLAN_FRACTIONS = [0.09, 0.19, 0.31, 0.43, 0.56, 0.69, 0.83, 0.92];

function buildPlan(): { t: number; s: Side }[] {
  const winner: Side = Math.random() < 0.5 ? "left" : "right";
  const other: Side = winner === "left" ? "right" : "left";
  const sides: Side[] = [winner, other, other, winner, other, winner, winner, winner];
  return PLAN_FRACTIONS.map((f, i) => ({ t: Math.round(f * DURATION_MS), s: sides[i] }));
}

function Countdown({
  endsAt,
  onExpire,
}: {
  endsAt: number;
  onExpire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);
  const tickRef = useRef<number | null>(null);

  const remaining = Math.max(0, endsAt - now);
  const secs = Math.ceil(remaining / 1000);
  const urgent = secs <= 3 && remaining > 0;

  const scale = useSharedValue(1);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (remaining <= 0 && !firedRef.current) {
      firedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onExpire();
    }
  }, [remaining, onExpire]);

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
  onResolved,
}: {
  left: Movie;
  right: Movie;
  label: string;
  onResolved: (winner: Side) => void;
}) {
  const [endsAt] = useState(() => Date.now() + DURATION_MS);
  const [counts, setCounts] = useState({ left: 0, right: 0 });
  const [picked, setPicked] = useState<Side | null>(null);
  const [revealed, setRevealed] = useState(false);
  const pickedRef = useRef<Side | null>(null);

  const share = useSharedValue(0.5);

  useEffect(() => {
    const plan = buildPlan();
    const timers = plan.map((v) =>
      setTimeout(() => {
        setCounts((c) => ({ ...c, [v.s]: c[v.s] + 1 }));
        Haptics.selectionAsync();
      }, v.t),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [left, right]);

  const onPick = (side: Side) => {
    if (revealed) return;
    const prev = pickedRef.current;
    if (prev === side) return;
    pickedRef.current = side;
    setPicked(side);
    setCounts((c) => {
      const next = { ...c, [side]: c[side] + 1 };
      if (prev) next[prev] = Math.max(0, next[prev] - 1);
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const onExpire = () => setRevealed(true);

  useEffect(() => {
    const total = counts.left + counts.right;
    share.value = withSpring(total === 0 ? 0.5 : counts.left / total, {
      damping: 16,
      stiffness: 200,
    });
  }, [counts, share]);

  const total = counts.left + counts.right;
  const winner: Side = counts.right > counts.left ? "right" : "left";
  const leftPct = total === 0 ? 50 : Math.round((counts.left / total) * 100);
  const winnerMovie = winner === "left" ? left : right;

  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => onResolved(winner), 1600);
    return () => clearTimeout(t);
  }, [revealed, winner, onResolved]);

  const leftBar = useAnimatedStyle(() => ({ flex: Math.max(0.001, share.value) }));
  const rightBar = useAnimatedStyle(() => ({
    flex: Math.max(0.001, 1 - share.value),
  }));

  return (
    <Animated.View entering={FadeIn.duration(280)} style={styles.root}>
      <Text style={styles.round}>{label}</Text>

      <Countdown endsAt={endsAt} onExpire={onExpire} />

      <View style={styles.arena}>
        <VoteCard
          movie={left}
          side="left"
          picked={picked === "left"}
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
          picked={picked === "right"}
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
          <Text style={[styles.pct, { color: ACCENT }]}>{leftPct}%</Text>
          <Text style={styles.tallyMid}>
            {revealed ? `${total} votes in` : "voting…"}
          </Text>
          <Text style={[styles.pct, { color: TEAL }]}>{100 - leftPct}%</Text>
        </View>
      </View>

      {revealed ? (
        <Animated.View
          entering={FadeInUp.delay(100).springify().damping(16)}
          style={styles.advanceRow}
        >
          <SymbolView name="checkmark.circle.fill" tintColor={ACCENT} size={16} weight="bold" />
          <Text style={styles.advanceText} numberOfLines={1}>
            {winnerMovie.title} advances
          </Text>
        </Animated.View>
      ) : (
        <Text style={styles.hint}>Tap a poster to cast your vote</Text>
      )}
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
});
