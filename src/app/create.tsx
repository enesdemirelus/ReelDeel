import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { type ReactNode, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
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
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassField } from "@/components/ui/glass-field";
import {
  SegmentedControl,
  type SegmentOption,
} from "@/components/ui/segmented-control";
import { EdgeBlur } from "@/components/ui/edge-blur";
import { SettingBlock } from "@/components/ui/setting-block";
import { Stepper } from "@/components/ui/stepper";
import { LavaBackdrop } from "@/components/lava-backdrop";
import { posterUri } from "@/lib/tmdb";
import { removeMovie, useMovieSelection } from "@/state/movie-selection";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Mode = "bracket" | "koth";
type Source = "players" | "host";

function poolWarning(mode: Mode, count: number): string | null {
  if (count === 0) return null;
  if (count < 2) return "Pick at least 2 movies to start a match.";
  if (mode === "bracket" && (count & (count - 1)) !== 0) {
    return `Bracket runs cleanest with 2, 4, 8, or 16 movies. With ${count}, some movies get a first-round bye.`;
  }
  return null;
}

const MODE_OPTIONS: SegmentOption<Mode>[] = [
  { value: "bracket", label: "Bracket", caption: "Tournament" },
  { value: "koth", label: "King of the Hill", caption: "Winner stays on" },
];

const SOURCE_OPTIONS: SegmentOption<Source>[] = [
  { value: "players", label: "Players add", caption: "Everyone contributes" },
  { value: "host", label: "I'll add them", caption: "Just you" },
];

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

export default function Create() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("bracket");
  const [source, setSource] = useState<Source>("players");
  const [perPlayer, setPerPlayer] = useState(3);
  const movies = useMovieSelection();

  const headerZoneH = insets.top + 172;
  const footerZoneH = insets.bottom + 150;

  const ready = name.trim().length > 0;
  const warning = source === "host" ? poolWarning(mode, movies.length) : null;

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 40], [1, 0], "clamp"),
    transform: [
      { translateY: interpolate(scrollY.value, [0, 40], [0, -6], "clamp") },
    ],
  }));

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const onAddMovies = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/movies");
  };

  const onRemoveMovie = (id: number) => {
    Haptics.selectionAsync();
    removeMovie(id);
  };

  const onCreate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/lobby");
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LavaBackdrop />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content} pointerEvents="box-none">
          <Animated.ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingTop: headerZoneH + 8, paddingBottom: footerZoneH + 8 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollIndicatorInsets={{ top: headerZoneH, bottom: footerZoneH }}
            onScroll={onScroll}
            scrollEventThrottle={16}
          >
            <SettingBlock label="Room name">
              <GlassField
                value={name}
                onChangeText={setName}
                placeholder="Friday Movie Night"
                maxLength={40}
                autoCapitalize="words"
                returnKeyType="done"
              />
            </SettingBlock>

            <SettingBlock label="Format" caption="How movies face off.">
              <SegmentedControl
                options={MODE_OPTIONS}
                value={mode}
                onChange={setMode}
              />
            </SettingBlock>

            <SettingBlock label="Who adds movies">
              <SegmentedControl
                options={SOURCE_OPTIONS}
                value={source}
                onChange={setSource}
              />
            </SettingBlock>

            {source === "players" ? (
              <Animated.View entering={FadeInDown.springify().damping(18)}>
                <SettingBlock label="Movies per player">
                  <Stepper
                    value={perPlayer}
                    min={1}
                    max={10}
                    onChange={setPerPlayer}
                    suffix={perPlayer === 1 ? "movie" : "movies"}
                  />
                </SettingBlock>
              </Animated.View>
            ) : null}

            {source === "host" ? (
              <Animated.View entering={FadeInDown.springify().damping(18)}>
                <SettingBlock
                  label="Movies"
                  caption={
                    movies.length
                      ? `${movies.length} added`
                      : "Add the movies to vote on."
                  }
                >
                  <SpringButton onPress={onAddMovies} style={styles.addButton}>
                    <SymbolView
                      name="plus"
                      tintColor="#FFFFFF"
                      size={18}
                      weight="semibold"
                    />
                    <Text style={styles.addLabel}>
                      {movies.length ? "Add or edit movies" : "Add movies"}
                    </Text>
                  </SpringButton>

                  {movies.length > 0 ? (
                    <View style={styles.grid}>
                      {movies.map((movie) => {
                        const uri = posterUri(movie.posterPath);
                        return (
                          <Pressable
                            key={movie.id}
                            style={styles.poster}
                            onPress={() => onRemoveMovie(movie.id)}
                          >
                            {uri ? (
                              <Image
                                source={{ uri }}
                                style={styles.posterImage}
                                contentFit="cover"
                                transition={150}
                              />
                            ) : (
                              <View style={styles.posterFallback}>
                                <SymbolView
                                  name="film"
                                  tintColor="rgba(255,255,255,0.5)"
                                  size={20}
                                />
                              </View>
                            )}
                            <View style={styles.posterRemove}>
                              <SymbolView
                                name="xmark"
                                tintColor="#FFFFFF"
                                size={11}
                                weight="bold"
                              />
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {warning ? (
                    <View style={styles.warning}>
                      <SymbolView
                        name="exclamationmark.triangle.fill"
                        tintColor="#FFB68A"
                        size={14}
                      />
                      <Text style={styles.warningText}>{warning}</Text>
                    </View>
                  ) : null}
                </SettingBlock>
              </Animated.View>
            ) : null}
          </Animated.ScrollView>

          <View
            style={[styles.headerZone, { height: headerZoneH }]}
            pointerEvents="box-none"
          >
            <EdgeBlur edge="top" intensity={64} />
            <View style={[styles.header, { paddingTop: insets.top + 56 }]}>
              <Text style={styles.title} allowFontScaling={false}>
                Create a Room
              </Text>
              <Animated.Text style={[styles.tagline, taglineStyle]}>
                Set up your movie night.
              </Animated.Text>
            </View>
          </View>

          <SpringButton
            onPress={onBack}
            style={{ ...styles.backButton, top: insets.top + 12 }}
          >
            <SymbolView
              name="chevron.left"
              tintColor="#FFFFFF"
              size={20}
              weight="semibold"
            />
          </SpringButton>

          <Animated.View
            entering={FadeInDown.delay(150).springify().damping(17)}
            style={[styles.footerZone, { height: footerZoneH }]}
            pointerEvents="box-none"
          >
            <EdgeBlur edge="bottom" intensity={64} />
            <View style={[styles.footerInner, { paddingBottom: insets.bottom + 16 }]}>
              {ready ? (
                <SpringButton onPress={onCreate} style={styles.signupButton}>
                  <Text style={styles.signupLabel}>Create Room</Text>
                </SpringButton>
              ) : (
                <View style={[styles.signupButton, styles.signupButtonDisabled]}>
                  <Text style={styles.signupLabel}>Create Room</Text>
                </View>
              )}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#050E17",
  },
  flex: {
    flex: 1,
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
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  headerZone: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 26,
    gap: 14,
  },
  title: {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: 30,
    lineHeight: 40,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -1,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
  },
  tagline: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.82)",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 150,
  },
  addButton: {
    height: 52,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  addLabel: {
    fontFamily: "Unbounded_600SemiBold",
    color: "#FFFFFF",
    fontSize: 13,
    letterSpacing: 0.1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  poster: {
    width: 62,
    height: 93,
  },
  posterImage: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  posterFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  posterRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,14,22,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  warning: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,122,60,0.4)",
    backgroundColor: "rgba(255,122,60,0.1)",
  },
  warningText: {
    flex: 1,
    color: "#FFCBAE",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
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
  signupButton: {
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
  signupButtonDisabled: {
    opacity: 0.4,
  },
  signupLabel: {
    fontFamily: "Unbounded_700Bold",
    color: "#000000",
    fontSize: 15,
    letterSpacing: 0.1,
  },
});
