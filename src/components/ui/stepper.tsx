import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function springTo(
  sv: SharedValue<number>,
  to: number,
  cfg: { damping: number; stiffness: number },
) {
  sv.value = withSpring(to, cfg);
}

function ScaleButton({
  onPress,
  disabled,
  style,
  children,
}: {
  onPress: () => void;
  disabled: boolean;
  style: ViewStyle;
  children: ReactNode;
}) {
  const pressed = useSharedValue(0);

  const press = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.92]) }],
    opacity: interpolate(pressed.value, [0, 1], [1, 0.9]),
  }));

  return (
    <AnimatedPressable
      onPress={disabled ? undefined : onPress}
      onPressIn={
        disabled ? undefined : () => springTo(pressed, 1, { damping: 22, stiffness: 420 })
      }
      onPressOut={
        disabled ? undefined : () => springTo(pressed, 0, { damping: 16, stiffness: 300 })
      }
      style={[style, disabled ? styles.disabled : null, press]}
    >
      {children}
    </AnimatedPressable>
  );
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix?: string;
}): React.JSX.Element {
  const canDecrement = value > min;
  const canIncrement = value < max;

  const step = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(next);
  };

  return (
    <View style={styles.row}>
      <ScaleButton
        onPress={() => step(-1)}
        disabled={!canDecrement}
        style={styles.button}
      >
        <SymbolView name="minus" tintColor="#FFFFFF" size={20} weight="semibold" />
      </ScaleButton>

      <Text style={styles.value} allowFontScaling={false}>
        {value}
        {suffix ? ` ${suffix}` : ""}
      </Text>

      <ScaleButton
        onPress={() => step(1)}
        disabled={!canIncrement}
        style={styles.button}
      >
        <SymbolView name="plus" tintColor="#FFFFFF" size={20} weight="semibold" />
      </ScaleButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  disabled: {
    opacity: 0.35,
  },
  value: {
    flex: 1,
    textAlign: "center",
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
