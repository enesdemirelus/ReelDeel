import { StyleSheet, Text, View } from "react-native";

export function SettingBlock({
  label,
  caption,
  children,
}: {
  label: string;
  caption?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.block}>
      <Text style={styles.label} allowFontScaling={false}>
        {label}
      </Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <View style={styles.control}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 22,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  caption: {
    marginTop: 3,
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "500",
  },
  control: {
    marginTop: 12,
  },
});
