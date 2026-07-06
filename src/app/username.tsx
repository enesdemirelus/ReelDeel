import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EdgeBlur } from "@/components/ui/edge-blur";
import { GlassField } from "@/components/ui/glass-field";
import { SpringButton } from "@/components/ui/spring-button";
import { LavaBackdrop } from "@/components/lava-backdrop";
import { avatarColor, initials } from "@/lib/avatar";
import { initRoom } from "@/state/room";

export default function Username() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [name, setName] = useState("");

  const ready = name.trim().length > 0;

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const onContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    initRoom({ role: "player", youName: name });
    router.replace("/lobby");
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
            <View style={[styles.header, { paddingTop: insets.top + 80 }]}>
              <View
                style={[
                  styles.preview,
                  { backgroundColor: avatarColor(name) },
                  ready ? styles.previewReady : null,
                ]}
              >
                <Text style={styles.previewInitials} allowFontScaling={false}>
                  {ready ? initials(name) : "?"}
                </Text>
              </View>
              <Text style={styles.title} allowFontScaling={false}>
                What&apos;s your name?
              </Text>
              <Text style={styles.tagline}>This is how the room will see you.</Text>
            </View>

            <View style={styles.fieldWrap}>
              <GlassField
                value={name}
                onChangeText={setName}
                placeholder="Your nickname"
                autoCapitalize="words"
                maxLength={20}
                returnKeyType="done"
                autoFocus
              />
            </View>
          </View>

          <Animated.View
            entering={FadeInDown.delay(150).springify().damping(17)}
            style={styles.footerZone}
            pointerEvents="box-none"
          >
            <EdgeBlur edge="bottom" intensity={64} />
            <View style={[styles.footerInner, { paddingBottom: insets.bottom + 16 }]}>
              {ready ? (
                <SpringButton onPress={onContinue} style={styles.signupButton}>
                  <Text style={styles.signupLabel}>Enter Lobby</Text>
                </SpringButton>
              ) : (
                <View style={[styles.signupButton, styles.signupButtonDisabled]}>
                  <Text style={styles.signupLabel}>Enter Lobby</Text>
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
    fontSize: 34,
    lineHeight: 44,
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
  preview: {
    width: 84,
    height: 84,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.2)",
    marginBottom: 10,
  },
  previewReady: {
    borderWidth: 2,
    borderColor: "#FF7A3C",
  },
  previewInitials: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 30,
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  fieldWrap: {
    width: "100%",
    paddingHorizontal: 24,
    marginTop: 36,
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
