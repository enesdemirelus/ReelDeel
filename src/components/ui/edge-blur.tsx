import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, type ViewStyle } from "react-native";
import Animated, {
  interpolate,
  type SharedValue,
  useAnimatedProps,
  useSharedValue,
} from "react-native-reanimated";

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export function EdgeBlur({
  edge,
  intensity = 60,
  minIntensity = 0,
  scrollY,
  scrollRange = [0, 56],
  style,
}: {
  edge: "top" | "bottom";
  intensity?: number;
  minIntensity?: number;
  scrollY?: SharedValue<number>;
  scrollRange?: [number, number];
  style?: ViewStyle;
}) {
  const colors =
    edge === "top"
      ? (["#000", "#000", "transparent"] as const)
      : (["transparent", "#000", "#000"] as const);
  const locations =
    edge === "top" ? ([0, 0.55, 1] as const) : ([0, 0.45, 1] as const);

  // BlurView.intensity is a native prop; reanimated drives it off the scroll
  // position without a re-render on the JS thread.
  const fallback = useSharedValue(0);
  const driver = scrollY ?? fallback;
  const animated = !!scrollY;
  const animatedProps = useAnimatedProps(() => ({
    intensity: animated
      ? interpolate(
          driver.value,
          scrollRange,
          [intensity, minIntensity],
          "clamp",
        )
      : intensity,
  }));

  return (
    <MaskedView
      style={[styles.fill, style]}
      pointerEvents="none"
      maskElement={
        <LinearGradient
          colors={colors}
          locations={locations}
          style={styles.fill}
        />
      }
    >
      <AnimatedBlurView
        tint="dark"
        style={styles.fill}
        animatedProps={animatedProps}
      />
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
