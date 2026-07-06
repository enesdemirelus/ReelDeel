import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LavaBackdrop } from "@/components/lava-backdrop";
import { EdgeBlur } from "@/components/ui/edge-blur";
import { SpringButton } from "@/components/ui/spring-button";
import type { Movie } from "@/state/movie-selection";
import { initRoom, type InitOptions } from "@/state/room";

const SEED: Movie[] = [
  { id: 27205, title: "Inception", posterPath: "/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg", year: "2010" },
  { id: 157336, title: "Interstellar", posterPath: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", year: "2014" },
  { id: 155, title: "The Dark Knight", posterPath: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg", year: "2008" },
  { id: 680, title: "Pulp Fiction", posterPath: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg", year: "1994" },
];

type DemoRow = {
  title: string;
  subtitle: string;
  config: InitOptions;
};

const HOST_ROWS: DemoRow[] = [
  {
    title: "Host · Bracket · Players add",
    subtitle: "Classic tournament, everyone contributes",
    config: { role: "host", name: "Movie Night", mode: "bracket", source: "players", anonymous: false },
  },
  {
    title: "Host · King of the Hill",
    subtitle: "Winner stays on",
    config: { role: "host", name: "Couch Wars", mode: "koth", source: "players", anonymous: false },
  },
  {
    title: "Host · I add the movies",
    subtitle: "Seeded pool of 4 movies",
    config: { role: "host", name: "My Picks", mode: "bracket", source: "host", anonymous: false, seedPool: SEED },
  },
  {
    title: "Host · Anonymous mode",
    subtitle: "Movie authors hidden",
    config: { role: "host", name: "Secret Ballot", mode: "bracket", source: "players", anonymous: true },
  },
];

const PLAYER_ROWS: DemoRow[] = [
  {
    title: "Player · Players add",
    subtitle: "Everyone contributes movies",
    config: { role: "player", youName: "You", source: "players", anonymous: false },
  },
  {
    title: "Player · Host adds movies",
    subtitle: "Host controls the pool",
    config: { role: "player", youName: "You", source: "host", anonymous: false },
  },
  {
    title: "Player · Anonymous mode",
    subtitle: "Movie authors hidden",
    config: { role: "player", youName: "You", source: "players", anonymous: true },
  },
];

export default function Demo() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const onBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const onLaunch = (config: InitOptions) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    initRoom(config);
    router.push("/lobby");
  };

  const onJoinFlow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/join");
  };

  const onBracketDemo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/demo-bracket");
  };

  const onKothDemo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/demo-koth");
  };

  const renderRow = (row: DemoRow) => (
    <SpringButton key={row.title} onPress={() => onLaunch(row.config)} style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{row.title}</Text>
        <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
      </View>
      <SymbolView name="chevron.right" tintColor="rgba(255,255,255,0.55)" size={15} weight="semibold" />
    </SpringButton>
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <LavaBackdrop />

      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title} allowFontScaling={false}>
            Demo Lab
          </Text>
          <Text style={styles.tagline}>Every lobby state, one tap.</Text>
        </View>

        <Text style={styles.sectionLabel}>Host</Text>
        {HOST_ROWS.map(renderRow)}

        <Text style={styles.sectionLabel}>Player</Text>
        {PLAYER_ROWS.map(renderRow)}

        <Text style={styles.sectionLabel}>Flow</Text>
        <SpringButton onPress={onBracketDemo} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Bracket duel demo</Text>
            <Text style={styles.rowSubtitle}>Draw → focus → vote → winner</Text>
          </View>
          <SymbolView name="chevron.right" tintColor="rgba(255,255,255,0.55)" size={15} weight="semibold" />
        </SpringButton>
        <SpringButton onPress={onKothDemo} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>King of the Hill demo</Text>
            <Text style={styles.rowSubtitle}>Winner stays, challengers step up</Text>
          </View>
          <SymbolView name="chevron.right" tintColor="rgba(255,255,255,0.55)" size={15} weight="semibold" />
        </SpringButton>
        <SpringButton onPress={onJoinFlow} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Join flow (enter code 12345)</Text>
            <Text style={styles.rowSubtitle}>Opens the join screen</Text>
          </View>
          <SymbolView name="chevron.right" tintColor="rgba(255,255,255,0.55)" size={15} weight="semibold" />
        </SpringButton>
      </ScrollView>

      <View style={[styles.headerZone, { height: insets.top + 56 }]} pointerEvents="none">
        <EdgeBlur edge="top" intensity={64} />
      </View>

      <SpringButton onPress={onBack} style={{ ...styles.backButton, top: insets.top + 12 }}>
        <SymbolView name="chevron.left" tintColor="#FFFFFF" size={20} weight="semibold" />
      </SpringButton>
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
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    fontFamily: "Unbounded_800ExtraBold",
    fontSize: 30,
    lineHeight: 40,
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
  sectionLabel: {
    fontFamily: "Unbounded_600SemiBold",
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 24,
    paddingBottom: 2,
  },
  row: {
    minHeight: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  rowText: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontFamily: "Unbounded_600SemiBold",
    color: "#FFFFFF",
    fontSize: 14,
    letterSpacing: 0.1,
  },
  rowSubtitle: {
    fontFamily: "Unbounded_500Medium",
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    letterSpacing: 0.1,
  },
  headerZone: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 5,
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
});
