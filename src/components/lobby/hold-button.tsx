import * as Haptics from "expo-haptics";
import type React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const PRESS_SPRING = { damping: 22, stiffness: 420 };
const RELEASE_SPRING = { damping: 16, stiffness: 300 };

function assign<T>(sv: SharedValue<T>, value: T) {
  "worklet";
  sv.value = value;
}

export function HoldButton({
  label,
  onComplete,
  holdMs = 1100,
  disabled,
  disabledLabel,
}: {
  label: string;
  onComplete: () => void;
  holdMs?: number;
  disabled?: boolean;
  disabledLabel?: string;
}): React.JSX.Element {
  const progress = useSharedValue(0);
  const scale = useSharedValue(1);
  const holding = useSharedValue(false);
  const fired = useSharedValue(false);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const whiteLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.35, 0.72], [0, 1], "clamp"),
  }));

  const fireComplete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete();
  };

  const gesture = Gesture.LongPress()
    .minDuration(600000)
    .maxDistance(10000)
    .shouldCancelWhenOutside(false)
    .onBegin(() => {
      assign(holding, true);
      assign(fired, false);
      assign(scale, withSpring(0.97, PRESS_SPRING));
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      assign(
        progress,
        withTiming(
          1,
          { duration: holdMs, easing: Easing.linear },
          (finished) => {
            if (finished && holding.value && !fired.value) {
              assign(fired, true);
              runOnJS(fireComplete)();
            }
          },
        ),
      );
    })
    .onFinalize(() => {
      assign(holding, false);
      assign(scale, withSpring(1, RELEASE_SPRING));
      if (!fired.value) {
        assign(progress, withTiming(0, { duration: 180 }));
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Soft);
      }
    });

  if (disabled) {
    return (
      <View style={[styles.button, styles.disabled]}>
        <View style={styles.labelLayer} pointerEvents="none">
          <Text style={styles.label}>{disabledLabel ?? label}</Text>
        </View>
      </View>
    );
  }

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.button, containerStyle]}>
        <Animated.View style={[styles.fill, fillStyle]} pointerEvents="none" />
        <View style={styles.labelLayer} pointerEvents="none">
          <Text style={styles.label}>{label}</Text>
        </View>
        <Animated.View
          style={[styles.labelLayer, whiteLabelStyle]}
          pointerEvents="none"
        >
          <Text style={styles.labelWhite}>{label}</Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 56,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF7A3C",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  disabled: {
    opacity: 0.4,
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(255,122,60,0.85)",
  },
  labelLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: "Unbounded_700Bold",
    color: "#000000",
    fontSize: 15,
    letterSpacing: 0.1,
  },
  labelWhite: {
    fontFamily: "Unbounded_700Bold",
    color: "#FFFFFF",
    fontSize: 15,
    letterSpacing: 0.1,
  },
});
