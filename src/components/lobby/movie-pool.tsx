import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { SpringButton } from "@/components/ui/spring-button";
import { posterUri } from "@/lib/tmdb";
import type { Player, PoolMovie } from "@/state/room";

export function MoviePool({
  movies,
  players,
  anonymous,
  youId,
  canAdd,
  onAdd,
  onRemove,
}: {
  movies: PoolMovie[];
  players: Player[];
  anonymous: boolean;
  youId: string;
  canAdd: boolean;
  onAdd: () => void;
  onRemove: (id: number) => void;
}): React.JSX.Element {
  if (movies.length === 0 && !canAdd) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No movies yet.</Text>
      </View>
    );
  }

  const onAddPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd();
  };

  return (
    <View style={styles.grid}>
      {canAdd ? (
        <SpringButton onPress={onAddPress} style={styles.tile}>
          <View style={styles.addTile}>
            <SymbolView name="plus" tintColor="#FFFFFF" size={26} weight="semibold" />
            <Text style={styles.addLabel}>Add</Text>
          </View>
        </SpringButton>
      ) : null}

      {movies.map((movie) => {
        const uri = posterUri(movie.posterPath);
        const mine = movie.addedBy === youId;
        const adder = mine
          ? "You"
          : players.find((p) => p.id === movie.addedBy)?.name ?? null;

        return (
          <Animated.View
            key={movie.id}
            entering={FadeInDown.springify().damping(18)}
            style={styles.tile}
          >
            <View style={styles.poster}>
              {uri ? (
                <Image
                  source={{ uri }}
                  style={styles.posterImage}
                  contentFit="cover"
                  transition={150}
                />
              ) : (
                <View style={styles.posterFallback}>
                  <SymbolView
                    name="film"
                    tintColor="rgba(255,255,255,0.5)"
                    size={22}
                  />
                </View>
              )}

              {mine ? (
                <Pressable
                  style={styles.posterRemove}
                  onPress={() => onRemove(movie.id)}
                >
                  <SymbolView
                    name="xmark"
                    tintColor="#FFFFFF"
                    size={11}
                    weight="bold"
                  />
                </Pressable>
              ) : null}
            </View>

            {!anonymous && adder ? (
              <Text style={styles.caption} numberOfLines={1}>
                {adder}
              </Text>
            ) : null}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: {
    width: 78,
  },
  poster: {
    width: 78,
    height: 117,
  },
  posterImage: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  posterFallback: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  posterRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,14,22,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
  },
  addTile: {
    width: 78,
    height: 117,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderStyle: "dashed",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.30)",
  },
  addLabel: {
    fontFamily: "Unbounded_600SemiBold",
    fontSize: 10,
    color: "#FFFFFF",
    letterSpacing: 0.1,
  },
  caption: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 10,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
    marginTop: 5,
    maxWidth: 78,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.55)",
  },
});
