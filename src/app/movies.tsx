import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeInDown,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassField } from "@/components/ui/glass-field";
import { EdgeBlur } from "@/components/ui/edge-blur";
import { LavaBackdrop } from "@/components/lava-backdrop";
import { posterUri, searchMovies } from "@/lib/tmdb";
import {
  type Movie,
  toggleMovie,
  useMovieSelection,
} from "@/state/movie-selection";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ACCENT = "#FF7A3C";

function springTo(
  sv: SharedValue<number>,
  to: number,
  cfg: { damping: number; stiffness: number },
) {
  sv.value = withSpring(to, cfg);
}

function SpringButton({
  onPress,
  style,
  children,
}: {
  onPress: () => void;
  style: ViewStyle;
  children: ReactNode;
}) {
  const pressed = useSharedValue(0);

  const press = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.96]) }],
    opacity: interpolate(pressed.value, [0, 1], [1, 0.9]),
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => springTo(pressed, 1, { damping: 22, stiffness: 420 })}
      onPressOut={() => springTo(pressed, 0, { damping: 16, stiffness: 300 })}
      style={[style, press]}
    >
      {children}
    </AnimatedPressable>
  );
}

function MovieRow({
  movie,
  selected,
  onPress,
}: {
  movie: Movie;
  selected: boolean;
  onPress: () => void;
}) {
  const uri = posterUri(movie.posterPath);

  return (
    <Pressable style={styles.row} onPress={onPress}>
      {uri ? (
        <Image source={{ uri }} style={styles.poster} contentFit="cover" />
      ) : (
        <View style={[styles.poster, styles.posterPlaceholder]}>
          <SymbolView
            name="film"
            tintColor="rgba(255,255,255,0.40)"
            size={22}
            weight="regular"
          />
        </View>
      )}

      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {movie.title}
        </Text>
        {movie.year ? <Text style={styles.rowYear}>{movie.year}</Text> : null}
      </View>

      <SymbolView
        name={selected ? "checkmark.circle.fill" : "circle"}
        tintColor={selected ? ACCENT : "rgba(255,255,255,0.30)"}
        size={26}
        weight="semibold"
      />
    </Pressable>
  );
}

export default function Movies() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const selection = useMovieSelection();
  const count = selection.length;
  const selectedIds = new Set(selection.map((m) => m.id));

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    const q = query.trim();

    const timer = setTimeout(() => {
      if (!q) {
        setResults([]);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      searchMovies(q, controller.signal)
        .then((movies) => {
          setResults(movies);
          setLoading(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setError("Couldn't load movies. Try again.");
          setLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const onDone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.back();
  };

  const onToggle = (movie: Movie) => {
    Haptics.selectionAsync();
    toggleMovie(movie);
  };

  const tagline =
    count === 0 ? "Search and pick your movies." : `${count} selected`;
  const doneLabel = count === 0 ? "Done" : `Done · ${count}`;
  const hasQuery = query.trim().length > 0;
  const data = hasQuery ? results : selection;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LavaBackdrop />

      <View style={styles.content}>
        <SpringButton
          onPress={onBack}
          style={{ ...styles.backButton, top: insets.top + 12 }}
        >
          <BlurView tint="dark" intensity={40} style={StyleSheet.absoluteFill} />
          <SymbolView
            name="chevron.left"
            tintColor="#FFFFFF"
            size={20}
            weight="semibold"
          />
        </SpringButton>

        <View style={[styles.header, { paddingTop: insets.top + 56 }]}>
          <Text style={styles.title} allowFontScaling={false}>
            Add Movies
          </Text>
          <Text style={styles.tagline}>{tagline}</Text>
        </View>

        <View style={styles.searchBlock}>
          <GlassField
            value={query}
            onChangeText={setQuery}
            placeholder="Search movies…"
            autoCapitalize="none"
            returnKeyType="done"
          />
        </View>

        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={Separator}
          ListHeaderComponent={
            !hasQuery && count > 0 ? (
              <Text style={styles.sectionLabel}>Your movies</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <MovieRow
              movie={item}
              selected={selectedIds.has(item.id)}
              onPress={() => onToggle(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : error ? (
                <Text style={styles.errorText}>{error}</Text>
              ) : hasQuery ? (
                <Text style={styles.emptyText}>No movies found.</Text>
              ) : (
                <Text style={styles.emptyText}>
                  Search above to add movies.
                </Text>
              )}
            </View>
          }
        />
      </View>

      <Animated.View
        entering={FadeInDown.delay(150).springify().damping(17)}
        style={[styles.footerZone, { height: insets.bottom + 150 }]}
        pointerEvents="box-none"
      >
        <EdgeBlur edge="bottom" intensity={64} />
        <View style={[styles.footerInner, { paddingBottom: insets.bottom + 16 }]}>
          <SpringButton onPress={onDone} style={styles.doneButton}>
            <Text style={styles.doneLabel}>{doneLabel}</Text>
          </SpringButton>
        </View>
      </Animated.View>
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#050E17",
  },
  content: {
    flex: 1,
  },
  backButton: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(10,16,24,0.55)",
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  title: {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: 34,
    lineHeight: 44,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -1,
    textShadowColor: "rgba(0,0,0,0.30)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  tagline: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.82)",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  searchBlock: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 120,
  },
  sectionLabel: {
    fontFamily: "Unbounded_700Bold",
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
  },
  poster: {
    width: 52,
    height: 78,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  posterPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontFamily: "Unbounded_600SemiBold",
    color: "#FFFFFF",
    fontSize: 14,
    letterSpacing: 0.1,
  },
  rowYear: {
    fontFamily: "Unbounded_400Regular",
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginLeft: 66,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 48,
  },
  emptyText: {
    fontFamily: "Unbounded_500Medium",
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    letterSpacing: 0.2,
  },
  errorText: {
    fontFamily: "Unbounded_500Medium",
    color: "rgba(248,113,113,0.85)",
    fontSize: 13,
    letterSpacing: 0.2,
  },
  footerZone: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  footerInner: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  doneButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF7A3C",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  doneLabel: {
    fontFamily: "Unbounded_700Bold",
    color: "#000000",
    fontSize: 15,
    letterSpacing: 0.1,
  },
});
