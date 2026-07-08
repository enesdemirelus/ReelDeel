import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

type SymbolName = ComponentProps<typeof SymbolView>["name"];

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  caption?: string;
  icon?: SymbolName;
};

export function SelectCards<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      {options.map((option) => (
        <Card
          key={option.value}
          option={option}
          selected={option.value === value}
          onPress={() => {
            Haptics.selectionAsync();
            onChange(option.value);
          }}
        />
      ))}
    </View>
  );
}

function Card<T extends string>({
  option,
  selected,
  onPress,
}: {
  option: SelectOption<T>;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const pressed = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.96]) }],
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => springTo(pressed, 1, { damping: 22, stiffness: 420 })}
      onPressOut={() => springTo(pressed, 0, { damping: 16, stiffness: 300 })}
      style={[styles.card, selected && styles.cardSelected, style]}
    >
      {option.icon ? (
        <SymbolView
          name={option.icon}
          tintColor={selected ? "#FF9A63" : "rgba(255,255,255,0.5)"}
          size={19}
          weight="semibold"
        />
      ) : null}

      <Text
        style={[styles.label, selected ? styles.labelSelected : styles.labelDim]}
        allowFontScaling={false}
      >
        {option.label}
      </Text>

      {option.caption ? (
        <Text style={styles.caption} allowFontScaling={false}>
          {option.caption}
        </Text>
      ) : null}

      {selected ? (
        <View style={styles.check}>
          <SymbolView name="checkmark" tintColor="#0B0B0B" size={11} weight="bold" />
        </View>
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 12,
  },
  card: {
    flex: 1,
    minHeight: 74,
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    gap: 5,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  cardSelected: {
    borderColor: "rgba(255,122,60,0.85)",
    backgroundColor: "rgba(255,122,60,0.12)",
  },
  label: {
    fontFamily: "Unbounded_600SemiBold",
    fontSize: 14,
    letterSpacing: 0.1,
    lineHeight: 19,
  },
  labelSelected: {
    color: "#FFFFFF",
  },
  labelDim: {
    color: "rgba(255,255,255,0.72)",
  },
  caption: {
    fontFamily: "Unbounded_400Regular",
    fontSize: 11,
    lineHeight: 15,
    color: "rgba(255,255,255,0.5)",
  },
  check: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF9A63",
  },
});
