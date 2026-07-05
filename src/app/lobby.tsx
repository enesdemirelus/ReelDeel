import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

import { LavaBackdrop } from "@/components/lava-backdrop";

export default function Lobby() {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LavaBackdrop />

      <View style={styles.content}>
        <Text
          style={styles.title}
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          Lobby
        </Text>
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
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
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
});
