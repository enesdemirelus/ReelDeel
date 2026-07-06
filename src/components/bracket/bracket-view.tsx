import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { posterUri } from "@/lib/tmdb";
import type { Movie } from "@/state/movie-selection";

export type Side = "a" | "b";
export type Matchup = { a: Movie | null; b: Movie | null; winner: Side | null };
export type Rounds = Matchup[][];

const CARD_W = 92;
const CARD_H = 140;
const COL_GAP = 26;
const VGAP = 14;
const PAD_V = 10;
const SLOT_H = 53;
const VS_H = 14;

const centerOf = (top: number) => top + CARD_H / 2;

const LINE = "rgba(255,255,255,0.16)";
const ACCENT = "#FF7A3C";

type Seg = { x: number; y: number; w: number; h: number };

function bracketConnector(
  childRightX: number,
  parentLeftX: number,
  cyA: number,
  cyB: number,
  py: number,
): Seg[] {
  const midX = childRightX + (parentLeftX - childRightX) / 2;
  const top = Math.min(cyA, cyB);
  const bottom = Math.max(cyA, cyB);
  return [
    { x: childRightX, y: cyA - 1, w: midX - childRightX, h: 2 },
    { x: childRightX, y: cyB - 1, w: midX - childRightX, h: 2 },
    { x: midX - 1, y: top, w: 2, h: bottom - top },
    { x: midX, y: py - 1, w: parentLeftX - midX, h: 2 },
  ];
}

type Layout = {
  bracketSize: number;
  roundCount: number;
  roundN: number[];
  colX: number[];
  roundTop: number[][];
  roundCen: number[][];
  connectors: Seg[];
  canvasW: number;
  canvasH: number;
};

function computeLayout(bracketSize: number): Layout {
  const roundCount = Math.max(1, Math.round(Math.log2(bracketSize)));
  const roundN = Array.from({ length: roundCount }, (_, r) => bracketSize / 2 ** (r + 1));
  const colX = Array.from({ length: roundCount }, (_, r) => r * (CARD_W + COL_GAP));
  const r0Top = Array.from({ length: roundN[0] }, (_, i) => i * (CARD_H + VGAP));
  const roundCen: number[][] = [r0Top.map(centerOf)];
  for (let r = 1; r < roundCount; r++) {
    const prev = roundCen[r - 1];
    roundCen.push(
      Array.from({ length: roundN[r] }, (_, i) => (prev[i * 2] + prev[i * 2 + 1]) / 2),
    );
  }
  const roundTop = roundCen.map((cs) => cs.map((c) => c - CARD_H / 2));
  const connectors: Seg[] = [];
  for (let r = 0; r < roundCount - 1; r++) {
    for (let i = 0; i < roundN[r + 1]; i++) {
      connectors.push(
        ...bracketConnector(
          colX[r] + CARD_W,
          colX[r + 1],
          roundCen[r][i * 2],
          roundCen[r][i * 2 + 1],
          roundCen[r + 1][i],
        ),
      );
    }
  }
  const canvasW = colX[roundCount - 1] + CARD_W;
  const canvasH = r0Top[roundN[0] - 1] + CARD_H;
  return { bracketSize, roundCount, roundN, colX, roundTop, roundCen, connectors, canvasW, canvasH };
}

type SlotResult = "won" | "lost" | null;

function Slot({
  movie,
  locked,
  spinning,
  result,
}: {
  movie: Movie | null;
  locked: boolean;
  spinning: boolean;
  result: SlotResult;
}) {
  const pop = useSharedValue(0.9);

  useEffect(() => {
    if (locked) {
      pop.value = withSequence(
        withSpring(1.06, { damping: 8, stiffness: 340 }),
        withSpring(1, { damping: 14, stiffness: 240 }),
      );
    }
  }, [locked, pop]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }],
    opacity: (spinning && !locked) || result === "lost" ? 0.5 : 1,
  }));

  const uri = movie ? posterUri(movie.posterPath) : null;
  const won = result === "won";

  return (
    <Animated.View style={[styles.slot, style]}>
      <View style={[styles.thumb, won && styles.thumbWon]}>
        {uri ? (
          <Image source={{ uri }} style={styles.thumbImg} contentFit="cover" />
        ) : (
          <View style={styles.thumbEmpty}>
            <SymbolView name="film" tintColor="rgba(255,255,255,0.4)" size={16} />
          </View>
        )}
        {won ? (
          <View style={styles.wonBadge}>
            <SymbolView name="checkmark" tintColor="#0B0F14" size={10} weight="bold" />
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

function Cell({
  a,
  b,
  lockedA,
  lockedB,
  spinning,
  focused,
  winner,
  x,
  y,
}: {
  a: Movie | null;
  b: Movie | null;
  lockedA: boolean;
  lockedB: boolean;
  spinning: boolean;
  focused: boolean;
  winner: Side | null;
  x: number;
  y: number;
}) {
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.value = withTiming(focused ? 1 : 0, { duration: 260 });
  }, [focused, glow]);

  const border = useAnimatedStyle(() => ({
    borderColor: focused ? ACCENT : "rgba(255,255,255,0.16)",
    shadowOpacity: 0.5 * glow.value,
  }));

  const resultA: SlotResult = winner ? (winner === "a" ? "won" : "lost") : null;
  const resultB: SlotResult = winner ? (winner === "b" ? "won" : "lost") : null;
  const empty = !a && !b;

  return (
    <Animated.View
      style={[styles.cell, { left: x, top: y, opacity: empty ? 0.5 : 1 }, border]}
    >
      <Slot movie={a} locked={lockedA} spinning={spinning} result={resultA} />
      <View style={styles.vsRow}>
        <View style={styles.vsLine} />
        <Text style={styles.vsText}>VS</Text>
        <View style={styles.vsLine} />
      </View>
      <Slot movie={b} locked={lockedB} spinning={spinning} result={resultB} />
    </Animated.View>
  );
}

export function BracketView({
  rounds,
  seeds,
  pool,
  seeding,
  focus,
  focusRound,
  focusIndex,
  dim,
  onSeeded,
}: {
  rounds: Rounds;
  seeds: (Movie | null)[];
  pool: Movie[];
  seeding: boolean;
  focus: boolean;
  focusRound: number;
  focusIndex: number;
  dim: boolean;
  onSeeded: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const bracketSize = seeds.length;
  const layout = computeLayout(bracketSize);
  const [display, setDisplay] = useState<(Movie | null)[]>(() =>
    Array(bracketSize).fill(null),
  );
  const [locked, setLocked] = useState<boolean[]>(() => seeds.map((s) => !s));
  const lockedRef = useRef<boolean[]>(seeds.map((s) => !s));

  useEffect(() => {
    if (!seeding) return;

    const spin = setInterval(() => {
      setDisplay((prev) =>
        prev.map((m, i) =>
          lockedRef.current[i] ? m : pool[Math.floor(Math.random() * pool.length)],
        ),
      );
    }, 70);

    const timers: ReturnType<typeof setTimeout>[] = [];
    seeds.forEach((movie, i) => {
      if (!movie) return;
      timers.push(
        setTimeout(() => {
          lockedRef.current[i] = true;
          setLocked([...lockedRef.current]);
          setDisplay((prev) => {
            const next = [...prev];
            next[i] = movie;
            return next;
          });
          Haptics.selectionAsync();
        }, 850 + i * 230),
      );
    });

    timers.push(
      setTimeout(() => {
        clearInterval(spin);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onSeeded();
      }, 850 + bracketSize * 230 + 500),
    );

    return () => {
      clearInterval(spin);
      for (const t of timers) clearTimeout(t);
    };
  }, [seeding, seeds, pool, onSeeded, bracketSize]);

  const availTop = 96;
  const centerX = width / 2;
  const centerY = availTop + (height - availTop) / 2;
  const fit = Math.min(
    1,
    (width - 24) / layout.canvasW,
    (height - availTop - 40) / layout.canvasH,
  );
  const focusScale = Math.min(1.6, (width * 0.62) / CARD_W);
  const cx = layout.colX[focusRound] + CARD_W / 2;
  const cy = layout.roundCen[focusRound][focusIndex];

  const restTx = centerX - (fit * layout.canvasW) / 2;
  const restTy = centerY - (fit * layout.canvasH) / 2;
  const focusTx = centerX - focusScale * cx;
  const focusTy = centerY - focusScale * cy;

  const p = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    p.value = withSpring(focus ? 1 : 0, { damping: 26, stiffness: 90 });
  }, [focus, p]);

  useEffect(() => {
    fade.value = withTiming(dim ? 0 : 1, { duration: 320 });
  }, [dim, fade]);

  const areaStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const canvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: restTx + (focusTx - restTx) * p.value },
      { translateY: restTy + (focusTy - restTy) * p.value },
      { scale: fit + (focusScale - fit) * p.value },
    ],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, areaStyle]} pointerEvents="none">
      <Animated.View
        style={[styles.canvas, { width: layout.canvasW, height: layout.canvasH }, canvasStyle]}
      >
        {layout.connectors.map((s, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              left: s.x,
              top: s.y,
              width: s.w,
              height: s.h,
              backgroundColor: LINE,
            }}
          />
        ))}

        {layout.roundN.map((n, r) =>
          Array.from({ length: n }, (_, i) => {
            const mu = rounds[r][i];
            const seedingR0 = seeding && r === 0;
            const a = seedingR0 ? display[i * 2] : mu.a;
            const b = seedingR0 ? display[i * 2 + 1] : mu.b;
            return (
              <Cell
                key={`${r}-${i}`}
                a={a}
                b={b}
                lockedA={seedingR0 ? locked[i * 2] : true}
                lockedB={seedingR0 ? locked[i * 2 + 1] : true}
                spinning={seedingR0}
                focused={focus && r === focusRound && i === focusIndex}
                winner={mu.winner}
                x={layout.colX[r]}
                y={layout.roundTop[r][i]}
              />
            );
          }),
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    position: "absolute",
    left: 0,
    top: 0,
    transformOrigin: "0% 0%",
  },
  cell: {
    position: "absolute",
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: PAD_V,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    shadowColor: ACCENT,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  slot: {
    height: SLOT_H,
    alignItems: "center",
    justifyContent: "center",
  },
  thumb: {
    width: 34,
    height: 50,
    borderRadius: 5,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  thumbWon: {
    borderColor: ACCENT,
    borderWidth: 2,
  },
  thumbImg: {
    width: "100%",
    height: "100%",
  },
  thumbEmpty: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  wonBadge: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 16,
    height: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
  },
  vsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: VS_H,
  },
  vsLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  vsText: {
    fontFamily: "Unbounded_700Bold",
    fontSize: 8,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.5)",
  },
});
