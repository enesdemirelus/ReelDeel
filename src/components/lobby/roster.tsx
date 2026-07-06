import { SymbolView } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { avatarColor, initials } from "@/lib/avatar";
import type { Player } from "@/state/room";

export function Roster({ players }: { players: Player[] }): React.JSX.Element {
  const ordered = [...players].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    if (a.isYou !== b.isYou) return a.isYou ? 1 : -1;
    return 0;
  });

  return (
    <View style={styles.row}>
      {ordered.map((player) => (
        <Animated.View
          key={player.id}
          entering={FadeInDown.springify().damping(16)}
          style={styles.chip}
        >
          <View style={styles.avatarWrap}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: avatarColor(player.name) },
                player.isYou ? styles.avatarYou : null,
              ]}
            >
              <Text style={styles.initials} allowFontScaling={false}>
                {initials(player.name)}
              </Text>
            </View>

            {player.isHost ? (
              <View style={styles.crown}>
                <SymbolView name="crown.fill" tintColor="#FFD479" size={10} />
              </View>
            ) : null}
          </View>

          <Text style={styles.name} numberOfLines={1}>
            {player.isYou ? "You" : player.name}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  chip: {
    width: 58,
    alignItems: "center",
    gap: 8,
  },
  avatarWrap: {
    width: 52,
    height: 52,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  avatarYou: {
    borderWidth: 2,
    borderColor: "#FF7A3C",
  },
  initials: {
    fontFamily: "Unbounded_600SemiBold",
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  crown: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,14,22,0.95)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  name: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
    maxWidth: 58,
  },
});
