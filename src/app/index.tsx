import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
  FadeInDown,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LavaBackdrop } from "@/components/lava-backdrop";
import { PosterStack } from "@/components/poster-stack";
import { SpringButton as GlassButton } from "@/components/ui/spring-button";
import { getRoomHistory, removeRoomVisit, type RoomVisit } from "@/lib/history";
import { posterUri } from "@/lib/tmdb";
import { joinRoom, roomExists } from "@/state/room";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

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

function RecentRoomRow({
  visit,
  active,
  busy,
  onRejoin,
}: {
  visit: RoomVisit;
  active: boolean;
  busy: boolean;
  onRejoin: (visit: RoomVisit) => void;
}) {
  const uri = visit.winnerPosterPath ? posterUri(visit.winnerPosterPath) : null;

  const inner = (
    <>
      <View style={styles.recentInfo}>
        <View style={styles.recentTopLine}>
          <Text style={styles.recentName} numberOfLines={1}>
            {visit.roomName}
          </Text>
          <Text style={styles.recentCode} allowFontScaling={false}>
            {visit.code}
          </Text>
        </View>
        {visit.winnerTitle ? (
          <View style={styles.recentWinnerLine}>
            {uri ? (
              <Image source={{ uri }} style={styles.recentPoster} contentFit="cover" />
            ) : null}
            <Text style={styles.recentWinner} numberOfLines={1}>
              Winner: {visit.winnerTitle}
            </Text>
          </View>
        ) : null}
      </View>
      {active ? (
        <View style={styles.rejoinPill}>
          <Text style={styles.rejoinText}>{busy ? "Joining…" : "Rejoin"}</Text>
        </View>
      ) : null}
    </>
  );

  if (active) {
    return (
      <GlassButton
        onPress={() => onRejoin(visit)}
        disabled={busy}
        style={styles.recentRow}
        accessibilityLabel={`Rejoin ${visit.roomName}, code ${visit.code}`}
      >
        {inner}
      </GlassButton>
    );
  }

  return (
    <View
      style={[styles.recentRow, styles.recentRowDim]}
      accessibilityRole="text"
      accessibilityLabel={`${visit.roomName}, code ${visit.code}${
        visit.winnerTitle ? `, winner ${visit.winnerTitle}` : ""
      }`}
    >
      {inner}
    </View>
  );
}

export default function Index() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [visits, setVisits] = useState<RoomVisit[]>([]);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    let alive = true;
    void (async () => {
      const history = await getRoomHistory();
      const shown = history.slice(0, 4);
      if (!alive) return;
      setVisits(shown);
      const checks = await Promise.all(
        shown.map(async (v) => {
          try {
            return [v.code, await roomExists(v.code)] as const;
          } catch {
            return [v.code, false] as const;
          }
        }),
      );
      if (!alive) return;
      setActive(Object.fromEntries(checks));
    })();
    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(load);

  const onRejoin = async (visit: RoomVisit) => {
    if (busy[visit.code]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy((b) => ({ ...b, [visit.code]: true }));
    try {
      await joinRoom(visit.code, visit.myName);
      router.push("/lobby");
    } catch (err) {
      setActive((a) => ({ ...a, [visit.code]: false }));
      if (err instanceof Error && err.message === "room-unavailable") {
        void removeRoomVisit(visit.code);
        setVisits((vs) => vs.filter((v) => v.code !== visit.code));
      }
    } finally {
      setBusy((b) => ({ ...b, [visit.code]: false }));
    }
  };

  const onCreateRoom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push("/create");
  };

  const onJoinRoom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/join");
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LavaBackdrop />

      <View style={styles.content} pointerEvents="box-none">
        <View style={[styles.header, { paddingTop: insets.top + 88 }]}>
          <Text
            style={styles.title}
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            Reel Duel
          </Text>
          <Text style={styles.tagline}>Pick the movie. Duel it out.</Text>
        </View>

        <View style={styles.deckWrap} pointerEvents="box-none">
          <PosterStack />
        </View>

        <Animated.View
          entering={FadeInDown.delay(150).springify().damping(17)}
          style={[styles.cardWrap, { paddingBottom: insets.bottom + 16 }]}
          pointerEvents="box-none"
        >
          <BlurView intensity={40} tint="light" style={styles.card}>
            <SpringButton onPress={onCreateRoom} style={styles.signupButton}>
              <Text style={styles.signupLabel}>Create a Room</Text>
            </SpringButton>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <SpringButton onPress={onJoinRoom} style={styles.ghostButton}>
              <Text style={styles.ghostLabel}>Join with a Code</Text>
            </SpringButton>
          </BlurView>

          {visits.length > 0 ? (
            <View style={styles.recentSection}>
              <Text style={styles.recentHeading}>Recent rooms</Text>
              <View style={styles.recentList}>
                {visits.map((v) => (
                  <RecentRoomRow
                    key={v.code}
                    visit={v}
                    active={!!active[v.code]}
                    busy={!!busy[v.code]}
                    onRejoin={onRejoin}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </Animated.View>
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
  content: {
    flex: 1,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  deckWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: 46,
    lineHeight: 56,
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
  },
  cardWrap: {
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 28,
    overflow: "hidden",
    padding: 16,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
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
  signupLabel: {
    fontFamily: "Unbounded_700Bold",
    color: "#000000",
    fontSize: 15,
    letterSpacing: 0.1,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  dividerLabel: {
    fontFamily: "Unbounded_600SemiBold",
    color: "rgba(255,255,255,0.55)",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  ghostButton: {
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostLabel: {
    fontFamily: "Unbounded_600SemiBold",
    color: "#FFFFFF",
    fontSize: 14,
    letterSpacing: 0.1,
  },
  recentSection: {
    marginTop: 24,
    gap: 12,
  },
  recentHeading: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.55)",
    marginLeft: 6,
  },
  recentList: {
    gap: 8,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  recentRowDim: {
    opacity: 0.55,
  },
  recentInfo: {
    flex: 1,
    gap: 4,
  },
  recentTopLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recentName: {
    flexShrink: 1,
    fontFamily: "Unbounded_600SemiBold",
    fontSize: 14,
    color: "#FFFFFF",
    letterSpacing: 0.1,
  },
  recentCode: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 11,
    letterSpacing: 2,
    color: "rgba(255,255,255,0.5)",
  },
  recentWinnerLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recentPoster: {
    width: 20,
    height: 30,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  recentWinner: {
    flexShrink: 1,
    fontFamily: "Unbounded_500Medium",
    fontSize: 11,
    color: "rgba(255,182,138,0.9)",
    letterSpacing: 0.1,
  },
  rejoinPill: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,122,60,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,122,60,0.45)",
  },
  rejoinText: {
    fontFamily: "Unbounded_600SemiBold",
    fontSize: 12,
    color: "#FFB68A",
    letterSpacing: 0.2,
  },
});
