import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { type ReactNode } from "react";
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

export default function Index() {
  const insets = useSafeAreaInsets();

  const onCreateRoom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const onJoinRoom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
          <Text style={styles.tagline}>Pick the movie. Together.</Text>
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
    fontSize: 58,
    lineHeight: 64,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -1,
    textShadowColor: "rgba(0,0,0,0.30)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  tagline: {
    fontSize: 20,
    fontWeight: "600",
    color: "rgba(255,255,255,0.90)",
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
    color: "#000000",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
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
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
