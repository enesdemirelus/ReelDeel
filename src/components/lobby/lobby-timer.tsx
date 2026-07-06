import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
} from "react-native-reanimated";

const ACCENT = "#FF7A3C";
const DANGER = "#F87171";
const URGENT_AT = 10;

function assign<T>(sv: SharedValue<T>, value: T) {
  "worklet";
  sv.value = value;
}

function format(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function LobbyTimer({
  endsAt,
  onExpire,
}: {
  endsAt: number;
  onExpire?: () => void;
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now());

  const expiredRef = useRef(false);
  const buzzedSecondRef = useRef<number | null>(null);

  const remainingMs = Math.max(0, endsAt - now);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const urgent = remainingSeconds <= URGENT_AT && remainingSeconds > 0;

  const scale = useSharedValue(1);
  const danger = useSharedValue(0);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    assign(danger, withSpring(urgent ? 1 : 0, { damping: 16, stiffness: 220 }));
  }, [urgent, danger]);

  useEffect(() => {
    if (remainingSeconds <= 0) {
      if (!expiredRef.current) {
        expiredRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onExpire?.();
      }
      return;
    }

    if (remainingSeconds <= 5 && buzzedSecondRef.current !== remainingSeconds) {
      buzzedSecondRef.current = remainingSeconds;
      Haptics.selectionAsync();
      assign(
        scale,
        withSequence(
          withSpring(1.06, { damping: 9, stiffness: 320 }),
          withSpring(1, { damping: 13, stiffness: 240 }),
        ),
      );
    }
  }, [remainingSeconds, onExpire, scale]);

  useEffect(() => {
    if (urgent) {
      assign(
        scale,
        withRepeat(
          withSequence(
            withSpring(1.06, { damping: 10, stiffness: 260 }),
            withSpring(1, { damping: 14, stiffness: 220 }),
          ),
          -1,
          false,
        ),
      );
    } else {
      assign(scale, withSpring(1, { damping: 15, stiffness: 260 }));
    }
  }, [urgent, scale]);

  const capsuleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderColor: interpolateColor(
      danger.value,
      [0, 1],
      ["rgba(255,255,255,0.22)", "rgba(248,113,113,0.55)"],
    ),
    backgroundColor: interpolateColor(
      danger.value,
      [0, 1],
      ["rgba(255,255,255,0.08)", "rgba(248,113,113,0.14)"],
    ),
  }));

  const numberStyle = useAnimatedStyle(() => ({
    color: interpolateColor(danger.value, [0, 1], ["#FFFFFF", DANGER]),
  }));

  return (
    <Animated.View style={[styles.capsule, capsuleStyle]}>
      <SymbolView
        name="timer"
        tintColor={urgent ? DANGER : ACCENT}
        size={14}
        weight="semibold"
      />
      <Animated.Text
        style={[styles.number, numberStyle]}
        allowFontScaling={false}
      >
        {format(remainingSeconds)}
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  number: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 15,
    letterSpacing: 0.3,
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
  },
});
