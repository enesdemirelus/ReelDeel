import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { posterUri } from "@/lib/tmdb";
import type { Movie } from "@/state/movie-selection";

const ACCENT = "#FF7A3C";

export type ChallengerState = "current" | "defeated" | "upcoming" | "king";
export type Challenger = { movie: Movie; state: ChallengerState };

function Poster({
  movie,
  style,
}: {
  movie: Movie | null;
  style: StyleProp<ViewStyle>;
}) {
  const uri = movie ? posterUri(movie.posterPath) : null;
  return (
    <View style={style}>
      {uri ? (
        <Image source={{ uri }} style={styles.posterImg} contentFit="cover" />
      ) : (
        <View style={styles.posterEmpty}>
          <SymbolView name="film" tintColor="rgba(255,255,255,0.4)" size={20} />
        </View>
      )}
    </View>
  );
}

function KingCard({
  movie,
  streak,
  seeding,
}: {
  movie: Movie | null;
  streak: number;
  seeding: boolean;
}) {
  const pop = useSharedValue(1);

  useEffect(() => {
    if (!seeding) {
      pop.value = withSequence(
        withSpring(1.08, { damping: 9, stiffness: 320 }),
        withSpring(1, { damping: 14, stiffness: 220 }),
      );
    }
  }, [movie?.id, seeding, pop]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  const streakLabel =
    streak <= 0 ? "NEW KING" : `${streak} WIN${streak > 1 ? "S" : ""}`;

  return (
    <View style={styles.throne}>
      <SymbolView name="crown.fill" tintColor={ACCENT} size={26} weight="semibold" />
      <Animated.View style={style}>
        <Poster movie={movie} style={styles.kingPoster} />
      </Animated.View>
      <Text style={styles.kingName} numberOfLines={1}>
        {movie ? movie.title : ""}
      </Text>
      <View style={styles.streakPill}>
        <SymbolView name="flame.fill" tintColor={ACCENT} size={12} weight="bold" />
        <Text style={styles.streakText}>{streakLabel}</Text>
      </View>
    </View>
  );
}

function ChallengerCard({
  movie,
  state,
}: {
  movie: Movie | null;
  state: ChallengerState;
}) {
  const current = state === "current";
  const isKing = state === "king";
  const defeated = state === "defeated";

  return (
    <Animated.View
      style={[styles.challenger, current && styles.challengerCurrent]}
    >
      <Poster
        movie={movie}
        style={[
          styles.challengerPoster,
          current && styles.challengerPosterCurrent,
          isKing && styles.challengerPosterKing,
          defeated && styles.posterDim,
        ]}
      />
      {isKing ? (
        <View style={styles.crownBadge}>
          <SymbolView name="crown.fill" tintColor="#0B0F14" size={9} weight="bold" />
        </View>
      ) : null}
    </Animated.View>
  );
}

export function KothView({
  king,
  streak,
  challengers,
  seeds,
  pool,
  seeding,
  dim,
  onSeeded,
}: {
  king: Movie;
  streak: number;
  challengers: Challenger[];
  seeds: Movie[];
  pool: Movie[];
  seeding: boolean;
  dim: boolean;
  onSeeded: () => void;
}) {
  const [display, setDisplay] = useState<(Movie | null)[]>(() =>
    Array(seeds.length).fill(null),
  );
  const lockedRef = useRef<boolean[]>(Array(seeds.length).fill(false));

  useEffect(() => {
    if (!seeding) return;

    const spin = setInterval(() => {
      setDisplay((prev) =>
        prev.map((m, i) =>
          lockedRef.current[i] ? m : pool[Math.floor(Math.random() * pool.length)],
        ),
      );
    }, 70);

    const timers: ReturnType<typeof setTimeout>[] = [];
    seeds.forEach((movie, i) => {
      timers.push(
        setTimeout(() => {
          lockedRef.current[i] = true;
          setDisplay((prev) => {
            const next = [...prev];
            next[i] = movie;
            return next;
          });
          Haptics.selectionAsync();
        }, 850 + i * 230),
      );
    });

    timers.push(
      setTimeout(() => {
        clearInterval(spin);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onSeeded();
      }, 850 + seeds.length * 230 + 500),
    );

    return () => {
      clearInterval(spin);
      for (const t of timers) clearTimeout(t);
    };
  }, [seeding, seeds, pool, onSeeded]);

  const fade = useSharedValue(1);
  useEffect(() => {
    fade.value = withTiming(dim ? 0 : 1, { duration: 320 });
  }, [dim, fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, fadeStyle]}>
      <KingCard
        key={seeding ? "seed" : king.id}
        movie={seeding ? display[0] : king}
        streak={streak}
        seeding={seeding}
      />

      <Text style={styles.label}>CHALLENGERS</Text>

      <View style={styles.lineup}>
        {(seeding
          ? Array.from({ length: Math.max(0, seeds.length - 1) }, (_, i) => ({
              movie: display[i + 1],
              state: "upcoming" as ChallengerState,
            }))
          : challengers
        ).map((c, i) => (
          <ChallengerCard key={i} movie={c.movie} state={c.state} />
        ))}
      </View>

      {!seeding ? (
        <Animated.Text entering={FadeIn.duration(300)} style={styles.hint}>
          Winner stays on the hill
        </Animated.Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 20,
  },
  throne: {
    alignItems: "center",
    gap: 10,
  },
  kingPoster: {
    width: 132,
    height: 198,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: ACCENT,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  kingName: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 16,
    color: "#FFFFFF",
    textAlign: "center",
    maxWidth: 220,
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,122,60,0.14)",
  },
  streakText: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 10,
    letterSpacing: 1.5,
    color: "#FFB68A",
  },
  label: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 12,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.5)",
  },
  lineup: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    maxWidth: 360,
  },
  challenger: {
    alignItems: "center",
  },
  challengerCurrent: {
    transform: [{ translateY: -6 }, { scale: 1.08 }],
  },
  challengerPoster: {
    width: 52,
    height: 78,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  challengerPosterCurrent: {
    borderColor: ACCENT,
    borderWidth: 2,
  },
  challengerPosterKing: {
    borderColor: ACCENT,
    borderWidth: 2,
  },
  posterDim: {
    opacity: 0.28,
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
  crownBadge: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
  },
  hint: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
  },
});
