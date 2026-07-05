import * as Haptics from "expo-haptics";
import { useState } from "react";
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  caption?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}): React.JSX.Element {
  const [segWidth, setSegWidth] = useState(0);
  const hasCaption = options.some((o) => o.caption);

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const onLayout = (e: LayoutChangeEvent) => {
    setSegWidth(e.nativeEvent.layout.width / options.length);
  };

  const press = (next: T) => {
    Haptics.selectionAsync();
    onChange(next);
  };

  return (
    <View style={[styles.track, hasCaption && styles.trackTall]}>
      <View style={styles.inner} onLayout={onLayout}>
        {segWidth > 0 ? (
          <View
            style={[
              styles.pill,
              { width: segWidth, left: selectedIndex * segWidth },
            ]}
          />
        ) : null}
        <View style={styles.row}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                style={styles.segment}
                onPress={() => press(option.value)}
              >
                <Text
                  style={[styles.label, selected ? styles.labelSelected : styles.labelDim]}
                  numberOfLines={1}
                  allowFontScaling={false}
                >
                  {option.label}
                </Text>
                {option.caption ? (
                  <Text style={styles.caption} numberOfLines={1} allowFontScaling={false}>
                    {option.caption}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: 16,
    padding: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  trackTall: {
    paddingVertical: 7,
  },
  inner: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
  },
  pill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.65)",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  row: {
    flexDirection: "row",
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 2,
  },
  label: {
    fontSize: 15,
    letterSpacing: 0.2,
  },
  labelSelected: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  labelDim: {
    color: "rgba(255,255,255,0.55)",
    fontWeight: "600",
  },
  caption: {
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.55)",
  },
});
