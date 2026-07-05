import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, type ViewStyle } from "react-native";

export function EdgeBlur({
  edge,
  intensity = 60,
  style,
}: {
  edge: "top" | "bottom";
  intensity?: number;
  style?: ViewStyle;
}) {
  const colors =
    edge === "top"
      ? (["#000", "#000", "transparent"] as const)
      : (["transparent", "#000", "#000"] as const);
  const locations =
    edge === "top" ? ([0, 0.55, 1] as const) : ([0, 0.45, 1] as const);

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
      <BlurView intensity={intensity} tint="dark" style={styles.fill} />
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
