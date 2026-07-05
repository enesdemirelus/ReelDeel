import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LavaBackdrop } from "@/components/lava-backdrop";
import { PosterStack } from "@/components/poster-stack";

export default function Index() {
  const insets = useSafeAreaInsets();

  const onCreateRoom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // TODO: navigate to create-room
  };

  const onJoinRoom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // TODO: navigate to join-room
  };

  return (
    // overflow: "hidden" clips the drifting backdrop blobs to the screen.
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Molten dusk background: drifting radial blobs + film grain. */}
      <LavaBackdrop />

      {/* Content sits above the gradients. box-none lets touches fall through
          empty areas to nothing while still hitting the buttons. */}
      <View style={styles.content} pointerEvents="box-none">
        <View style={[styles.header, { paddingTop: insets.top + 88 }]}>
          {/* Big single-line display lockup. Tight negative tracking keeps it
              feeling like a movie title card, not a wide banner. */}
          <Text
            style={styles.title}
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            Reel Duel
          </Text>
          <Text style={styles.tagline}>Pick the movie. Together.</Text>
        </View>

        {/* Deck takes the whole middle so no gap is dead space. */}
        <View style={styles.deckWrap} pointerEvents="box-none">
          <PosterStack />
        </View>

        <View
          style={[styles.cardWrap, { paddingBottom: insets.bottom + 16 }]}
          pointerEvents="box-none"
        >
          {/* Frosted-glass card. overflow:hidden clips the blur to the rounded
              corners; the translucent border/fill add the glassy edge. */}
          <BlurView intensity={40} tint="light" style={styles.card}>
            <Pressable
              onPress={onCreateRoom}
              style={({ pressed }) => [
                styles.signupButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.signupLabel}>Create a Room</Text>
            </Pressable>

            <Pressable
              onPress={onJoinRoom}
              style={({ pressed }) => [
                styles.ghostButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.ghostLabel}>Join Room</Text>
            </Pressable>
          </BlurView>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: "#050E17", // fallback behind the backdrop
  },
  content: {
    flex: 1,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  deckWrap: {
    flex: 1, // eat the middle so the layout never leaves an empty band
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 58, // one line; adjustsFontSizeToFit shrinks on narrow screens
    lineHeight: 64,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -1, // tight display tracking; wide tracking reads generic
    // One soft, low-offset shadow: enough to lift the title off the bright
    // blobs without the muddy doubled-edge look a heavy shadow gives.
    textShadowColor: "rgba(0,0,0,0.30)",
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  tagline: {
    fontSize: 20,
    fontWeight: "600",
    color: "rgba(255,255,255,0.90)",
    letterSpacing: 0.2,
  },
  cardWrap: {
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 28,
    overflow: "hidden",
    padding: 16,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  signupButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  signupLabel: {
    color: "#000000",
    fontSize: 17,
    fontWeight: "700",
  },
  ghostButton: {
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostLabel: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.7,
  },
});
