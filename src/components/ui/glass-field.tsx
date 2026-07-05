import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import Animated, {
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

function timeTo(sv: SharedValue<number>, to: number) {
  sv.value = withTiming(to, { duration: 180 });
}

export function GlassField({
  value,
  onChangeText,
  placeholder,
  maxLength,
  autoCapitalize,
  returnKeyType,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  maxLength?: number;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  returnKeyType?: "done" | "next";
}): React.JSX.Element {
  const [, setFocused] = useState(false);
  const focus = useSharedValue(0);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(
      focus.value,
      [0, 1],
      ["rgba(255,255,255,0.22)", "rgba(255,255,255,0.65)"],
    ),
  }));

  const onFocus = () => {
    setFocused(true);
    timeTo(focus, 1);
  };

  const onBlur = () => {
    setFocused(false);
    timeTo(focus, 0);
  };

  return (
    <AnimatedTextInput
      value={value}
      onChangeText={onChangeText}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      placeholderTextColor="rgba(255,255,255,0.40)"
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      returnKeyType={returnKeyType}
      autoCorrect={false}
      keyboardAppearance="dark"
      style={[styles.input, borderStyle]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    width: "100%",
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "500",
  },
});
