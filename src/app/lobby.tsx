import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useEffect } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BracketGame } from "@/components/bracket/bracket-game";
import { KothGame } from "@/components/bracket/koth-game";
import { EdgeBlur } from "@/components/ui/edge-blur";
import { SpringButton } from "@/components/ui/spring-button";
import { HoldButton } from "@/components/lobby/hold-button";
import { LobbyTimer } from "@/components/lobby/lobby-timer";
import { MoviePool } from "@/components/lobby/movie-pool";
import { Roster } from "@/components/lobby/roster";
import { LavaBackdrop } from "@/components/lava-backdrop";
import { removeMovie, useMovieSelection } from "@/state/movie-selection";
import {
  endRoom,
  leaveRoom,
  type PoolMovie,
  startGame,
  syncMyMovies,
  transferHostAndLeave,
  useRoom,
} from "@/state/room";

const MIN_TO_START = 2;

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.countPill}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    </View>
  );
}

export default function Lobby() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const room = useRoom();
  const selection = useMovieSelection();

  useEffect(() => {
    if (!room) router.replace("/");
  }, [room, router]);

  useEffect(() => {
    syncMyMovies(selection);
  }, [selection]);

  useEffect(() => () => leaveRoom(), []);

  if (!room) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <LavaBackdrop />
      </View>
    );
  }

  const { config, players, pool, youId, endsAt, started } = room;
  const isHost = config.role === "host";
  const host = players.find((p) => p.isHost);

  const mine: PoolMovie[] = selection.map((m) => ({ ...m, addedBy: youId }));
  const movies: PoolMovie[] = [
    ...new Map([...pool, ...mine].map((m) => [m.id, m])).values(),
  ];
  const canAdd = isHost || config.source === "players";
  const enoughMovies = movies.length >= MIN_TO_START;

  const modeLabel = config.mode === "bracket" ? "Bracket" : "King of the Hill";
  const sourceLabel =
    config.source === "players" ? "Players add movies" : "Host picks movies";

  const footerH = insets.bottom + 116;

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isHost) {
      Alert.alert(
        "Leave the room?",
        "You're the host. Hand the room to another player, or end it for everyone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Transfer host & leave",
            onPress: () => {
              void transferHostAndLeave();
              router.back();
            },
          },
          {
            text: "End room for everyone",
            style: "destructive",
            onPress: () => {
              void endRoom();
              router.back();
            },
          },
        ],
      );
      return;
    }
    Alert.alert("Leave the room?", "You can rejoin later with the code.", [
      { text: "Cancel", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.back() },
    ]);
  };

  const onShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Share.share({
      message: `Join my ReelDuel room "${config.name}" — code ${config.code}`,
    });
  };

  const onAddMovies = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/movies");
  };

  const onRemoveMovie = (id: number) => {
    Haptics.selectionAsync();
    removeMovie(id);
  };

  const onStart = () => {
    startGame(movies);
  };

  const onExpire = () => {
    if (isHost && enoughMovies) startGame(movies);
  };

  const onExitStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace("/");
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LavaBackdrop />

      <View style={styles.content} pointerEvents="box-none">
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + 68, paddingBottom: footerH + 12 },
          ]}
          showsVerticalScrollIndicator={false}
          scrollIndicatorInsets={{ bottom: footerH }}
        >
          <View style={styles.playerHero}>
            <Text style={styles.roomName} numberOfLines={2}>
              {config.name}
            </Text>
            {isHost ? (
              <SpringButton
                onPress={onShare}
                style={styles.codePill}
                accessibilityLabel={`Share room code ${config.code}`}
              >
                <Text style={styles.codeLabel}>CODE</Text>
                <Text style={styles.codeValue} allowFontScaling={false}>
                  {config.code}
                </Text>
                <View style={styles.codeDivider} />
                <SymbolView
                  name="square.and.arrow.up"
                  tintColor="rgba(255,255,255,0.7)"
                  size={14}
                  weight="semibold"
                />
              </SpringButton>
            ) : host ? (
              <Text style={styles.hostedBy}>Hosted by {host.name}</Text>
            ) : null}
          </View>

          <View style={styles.chipRow}>
            <View style={styles.metaChip}>
              <SymbolView
                name={config.mode === "bracket" ? "square.grid.2x2" : "flag.checkered"}
                tintColor="#FF7A3C"
                size={13}
                weight="semibold"
              />
              <Text style={styles.metaChipText}>{modeLabel}</Text>
            </View>
            <View style={styles.metaChip}>
              <SymbolView
                name="person.2.fill"
                tintColor="#FF7A3C"
                size={13}
                weight="semibold"
              />
              <Text style={styles.metaChipText}>{sourceLabel}</Text>
            </View>
            {config.anonymous ? (
              <View style={styles.metaChip}>
                <SymbolView
                  name="eye.slash.fill"
                  tintColor="#FF7A3C"
                  size={13}
                  weight="semibold"
                />
                <Text style={styles.metaChipText}>Anonymous</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <SectionHeader label="IN THE ROOM" count={players.length} />
            <Roster players={players} />
          </View>

          <View style={styles.section}>
            <SectionHeader label="MOVIES" count={movies.length} />
            <MoviePool
              movies={movies}
              players={players}
              anonymous={config.anonymous}
              youId={youId}
              canAdd={canAdd}
              onAdd={onAddMovies}
              onRemove={onRemoveMovie}
            />
          </View>
        </ScrollView>

        <SpringButton
          onPress={onBack}
          style={{ ...styles.backButton, top: insets.top + 12 }}
          accessibilityLabel="Go back"
        >
          <SymbolView
            name="chevron.left"
            tintColor="#FFFFFF"
            size={20}
            weight="semibold"
          />
        </SpringButton>

        <View style={[styles.timerSlot, { top: insets.top + 12 }]}>
          <LobbyTimer endsAt={endsAt} onExpire={onExpire} />
        </View>

        <Animated.View
          entering={FadeInDown.delay(120).springify().damping(17)}
          style={[styles.footerZone, { height: footerH }]}
          pointerEvents="box-none"
        >
          <EdgeBlur edge="bottom" intensity={64} />
          <View
            style={[styles.footerInner, { paddingBottom: insets.bottom + 14 }]}
          >
            {isHost ? (
              <HoldButton
                label="Hold to Start"
                onComplete={onStart}
                disabled={!enoughMovies}
                disabledLabel={`Add ${MIN_TO_START}+ movies`}
              />
            ) : (
              <View style={styles.waitPill}>
                <SymbolView
                  name="hourglass"
                  tintColor="rgba(255,255,255,0.7)"
                  size={15}
                  weight="semibold"
                />
                <Text style={styles.waitText}>Waiting for the host to start…</Text>
              </View>
            )}
          </View>
        </Animated.View>
      </View>

      {started ? (
        <Animated.View entering={FadeIn.duration(260)} style={styles.startedOverlay}>
          {config.mode === "bracket" ? (
            <BracketGame pool={movies} onExit={onExitStarted} />
          ) : (
            <KothGame pool={movies} onExit={onExitStarted} />
          )}
        </Animated.View>
      ) : null}
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
  },
  scrollContent: {
    paddingHorizontal: 20,
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
  codePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 16,
    height: 44,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  codeLabel: {
    fontFamily: "Unbounded_600SemiBold",
    fontSize: 10,
    letterSpacing: 1.5,
    color: "rgba(255,255,255,0.5)",
  },
  codeValue: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 18,
    letterSpacing: 3,
    color: "#FFFFFF",
  },
  codeDivider: {
    width: StyleSheet.hairlineWidth,
    height: 20,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  playerHero: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  roomName: {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: 28,
    lineHeight: 36,
    color: "#FFFFFF",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  hostedBy: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  metaChipText: {
    fontFamily: "Unbounded_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.82)",
    letterSpacing: 0.1,
  },
  section: {
    marginTop: 28,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sectionLabel: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 13,
    letterSpacing: 1.4,
    color: "rgba(255,255,255,0.55)",
  },
  countPill: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,122,60,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,122,60,0.45)",
  },
  countText: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 12,
    color: "#FFB68A",
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
    paddingTop: 14,
  },
  timerSlot: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  waitPill: {
    height: 56,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  waitText: {
    fontFamily: "Unbounded_600SemiBold",
    fontSize: 13,
    color: "rgba(255,255,255,0.82)",
    letterSpacing: 0.1,
  },
  startedOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    backgroundColor: "#050E17",
  },
});
