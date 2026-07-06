import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  interpolate,
  interpolateColor,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EdgeBlur } from "@/components/ui/edge-blur";
import { LavaBackdrop } from "@/components/lava-backdrop";
import { roomExists } from "@/state/room";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const CODE_LENGTH = 5;
const SLOTS = Array.from({ length: CODE_LENGTH }, (_, i) => i);
const STAGGER = 60;

const NEUTRAL_DIM = "rgba(255,255,255,0.22)";
const NEUTRAL_BRIGHT = "rgba(255,255,255,0.65)";
const GREEN = "#34D399";
const RED = "#F87171";

type BoxStatus = "neutral" | "correct" | "wrong";
type BoxHandle = {
  wiggle: (status: BoxStatus) => void;
  pop: () => void;
  reset: () => void;
  vanish: () => void;
};
type Phase = "input" | "checking" | "correct" | "wrong";

function springTo(
  sv: SharedValue<number>,
  to: number,
  cfg: { damping: number; stiffness: number },
) {
  sv.value = withSpring(to, cfg);
}

function SpringButton({
  onPress,
  style,
  children,
}: {
  onPress: () => void;
  style: ViewStyle;
  children: ReactNode;
}) {
  const pressed = useSharedValue(0);

  const press = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, 0.96]) }],
    opacity: interpolate(pressed.value, [0, 1], [1, 0.9]),
  }));

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => springTo(pressed, 1, { damping: 22, stiffness: 420 })}
      onPressOut={() => springTo(pressed, 0, { damping: 16, stiffness: 300 })}
      style={[style, press]}
    >
      {children}
    </AnimatedPressable>
  );
}

function CodeBox({
  char,
  active,
  handleRef,
}: {
  char: string;
  active: boolean;
  handleRef: (h: BoxHandle | null) => void;
}) {
  const scale = useSharedValue(1);
  const ty = useSharedValue(0);
  const status = useSharedValue(0);
  const caret = useSharedValue(0);

  const showCaret = active && !char;

  useEffect(() => {
    if (showCaret) {
      caret.value = withRepeat(withTiming(1, { duration: 550 }), -1, true);
    } else {
      caret.value = withTiming(0, { duration: 120 });
    }
  }, [showCaret, caret]);

  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));

  useEffect(() => {
    handleRef({
      wiggle: (next) => {
        if (next === "correct") status.value = withTiming(1, { duration: 200 });
        else if (next === "wrong")
          status.value = withTiming(-1, { duration: 200 });
        scale.value = withSequence(
          withSpring(1.12, { damping: 8, stiffness: 340 }),
          withSpring(1, { damping: 13, stiffness: 260 }),
        );
        ty.value = withSequence(
          withSpring(-9, { damping: 8, stiffness: 340 }),
          withSpring(0, { damping: 13, stiffness: 260 }),
        );
      },
      pop: () => {
        scale.value = withSequence(
          withSpring(1.1, { damping: 10, stiffness: 360 }),
          withSpring(1, { damping: 14, stiffness: 280 }),
        );
      },
      reset: () => {
        status.value = withTiming(0, { duration: 160 });
      },
      vanish: () => {
        status.value = withTiming(0, { duration: 140 });
        scale.value = withSequence(
          withTiming(0.78, { duration: 95 }),
          withSpring(1, { damping: 15, stiffness: 300 }),
        );
        ty.value = withSequence(
          withTiming(7, { duration: 95 }),
          withSpring(0, { damping: 15, stiffness: 300 }),
        );
      },
    });
    return () => handleRef(null);
  }, [handleRef, scale, ty, status]);

  const style = useAnimatedStyle(() => {
    const borderColor = interpolateColor(
      status.value,
      [-1, 0, 1],
      [RED, active ? NEUTRAL_BRIGHT : NEUTRAL_DIM, GREEN],
    );
    return {
      transform: [{ scale: scale.value }, { translateY: ty.value }],
      borderColor,
      borderWidth: status.value === 0 ? StyleSheet.hairlineWidth : 1.5,
    };
  });

  return (
    <Animated.View style={[styles.box, style]}>
      {char ? (
        <Text style={styles.boxChar}>{char}</Text>
      ) : (
        <Animated.View style={[styles.caret, caretStyle]} />
      )}
    </Animated.View>
  );
}

export default function Join() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const boxRefs = useRef<(BoxHandle | null)[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState(false);

  const ready = code.length === CODE_LENGTH;
  const editable = phase !== "checking" && phase !== "correct";

  const shake = useSharedValue(0);
  const errorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const validate = async (value: string) => {
    setPhase("checking");

    let correct = false;
    try {
      correct = await roomExists(value);
    } catch {
      correct = false;
    }

    const at = (fn: () => void, ms: number) =>
      timers.current.push(setTimeout(fn, ms));

    [4, 3, 2, 1, 0].forEach((idx, k) => {
      at(() => boxRefs.current[idx]?.wiggle("neutral"), k * STAGGER);
    });

    const colorStart = CODE_LENGTH * STAGGER + 260;

    at(() => {
      Haptics.notificationAsync(
        correct
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );
    }, colorStart);

    [0, 1, 2, 3, 4].forEach((idx, k) => {
      at(
        () => boxRefs.current[idx]?.wiggle(correct ? "correct" : "wrong"),
        colorStart + k * STAGGER,
      );
    });

    const settle = colorStart + CODE_LENGTH * STAGGER + 320;
    at(() => {
      if (correct) {
        setPhase("correct");
        return;
      }
      setPhase("wrong");
      setError(true);
      shake.value = withSequence(
        withTiming(-8, { duration: 45 }),
        withTiming(8, { duration: 45 }),
        withTiming(-6, { duration: 45 }),
        withTiming(6, { duration: 45 }),
        withTiming(0, { duration: 45 }),
      );
    }, settle);

    if (!correct) {
      const readHold = settle + 850;
      const DELETE_STAGGER = 75;

      [4, 3, 2, 1, 0].forEach((idx, k) => {
        at(() => {
          setCode(value.slice(0, idx));
          boxRefs.current[idx]?.vanish();
          Haptics.selectionAsync();
        }, readHold + k * DELETE_STAGGER);
      });

      at(() => {
        setPhase("input");
        inputRef.current?.focus();
      }, readHold + CODE_LENGTH * DELETE_STAGGER + 160);
    }
  };

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const onChangeCode = (text: string) => {
    if (phase === "checking" || phase === "correct") return;

    const next = text
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, CODE_LENGTH);

    if (error && next.length > 0) setError(false);

    if (phase === "wrong") {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      boxRefs.current.forEach((b) => b?.reset());
      setError(false);
      setPhase("input");
    }

    if (next.length > code.length) {
      Haptics.selectionAsync();
      boxRefs.current[next.length - 1]?.pop();
    }
    setCode(next);

    if (next.length === CODE_LENGTH) validate(next);
  };

  const onJoin = () => {
    if (phase === "checking") return;
    if (code.length !== CODE_LENGTH) return;
    if (phase === "correct") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      router.push({ pathname: "/username", params: { code } });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    timers.current.forEach(clearTimeout);
    timers.current = [];
    boxRefs.current.forEach((b) => b?.reset());
    setError(false);
    validate(code);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LavaBackdrop />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.content} pointerEvents="box-none">
          <SpringButton
            onPress={onBack}
            style={{ ...styles.backButton, top: insets.top + 12 }}
          >
            <SymbolView
              name="chevron.left"
              tintColor="#FFFFFF"
              size={20}
              weight="semibold"
            />
          </SpringButton>

          <View style={styles.topGroup} pointerEvents="box-none">
            <View style={[styles.header, { paddingTop: insets.top + 88 }]}>
              <Text style={styles.title} allowFontScaling={false}>
                Join a Room
              </Text>
              <Text style={styles.tagline}>Enter the code from your host.</Text>
            </View>

            <Pressable
              style={styles.boxRow}
              onPress={() => inputRef.current?.focus()}
            >
              {SLOTS.map((i) => (
                <CodeBox
                  key={i}
                  char={code[i] ?? ""}
                  active={i === code.length && phase !== "correct"}
                  handleRef={(h) => {
                    boxRefs.current[i] = h;
                  }}
                />
              ))}
            </Pressable>

            {error ? (
              <Animated.View
                entering={FadeIn.duration(220)}
                style={[styles.errorPill, errorStyle]}
              >
                <SymbolView
                  name="xmark.circle.fill"
                  tintColor="#FCA5A5"
                  size={15}
                  weight="semibold"
                />
                <Text style={styles.errorText}>No room found for that code</Text>
              </Animated.View>
            ) : null}

            <TextInput
              ref={inputRef}
              value={code}
              onChangeText={onChangeCode}
              editable={editable}
              autoFocus
              maxLength={CODE_LENGTH}
              autoCapitalize="characters"
              autoCorrect={false}
              keyboardType="default"
              keyboardAppearance="dark"
              caretHidden
              style={styles.hiddenInput}
            />
          </View>

          <Animated.View
            entering={FadeInDown.delay(150).springify().damping(17)}
            style={styles.footerZone}
            pointerEvents="box-none"
          >
            <EdgeBlur edge="bottom" intensity={64} />
            <View style={[styles.footerInner, { paddingBottom: insets.bottom + 16 }]}>
              {ready && phase !== "checking" ? (
                <SpringButton onPress={onJoin} style={styles.signupButton}>
                  <Text style={styles.signupLabel}>Join Room</Text>
                </SpringButton>
              ) : (
                <View style={[styles.signupButton, styles.signupButtonDisabled]}>
                  <Text style={styles.signupLabel}>Join Room</Text>
                </View>
              )}
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#050E17",
  },
  flex: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
  },
  backButton: {
    position: "absolute",
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  topGroup: {
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  title: {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: 36,
    lineHeight: 46,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -1,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 12,
  },
  tagline: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 14,
    color: "rgba(255,255,255,0.82)",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  boxRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 24,
    marginTop: 44,
  },
  box: {
    width: 54,
    height: 66,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  boxChar: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "700",
  },
  caret: {
    width: 2,
    height: 30,
    borderRadius: 1,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  errorPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(248,113,113,0.4)",
    backgroundColor: "rgba(248,113,113,0.12)",
  },
  errorText: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 12,
    color: "#FCA5A5",
    letterSpacing: 0.1,
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  footerZone: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "flex-end",
  },
  footerInner: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  signupButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#FF7A3C",
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  signupButtonDisabled: {
    opacity: 0.4,
  },
  signupLabel: {
    fontFamily: "Unbounded_700Bold",
    color: "#000000",
    fontSize: 15,
    letterSpacing: 0.1,
  },
});
