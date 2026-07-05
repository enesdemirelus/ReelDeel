import { LinearGradient } from "expo-linear-gradient";
import { useEffect } from "react";
import {
  Image,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

/**
 * Animated "molten dusk" backdrop: soft radial color blobs drifting and
 * melting into each other over a deep ink base, finished with a film-grain
 * tile. Palette is deliberately cinema-warm (ember / gold / teal) — no
 * purple, no neon.
 *
 * How the lava-lamp effect works, in three cheap tricks:
 *  1. Each blob is a soft-edged radial gradient (color -> transparent), so
 *     overlapping blobs visually "melt" together without any blur pass.
 *  2. Color morphing: two differently-hued gradient layers per blob, and we
 *     crossfade the top one's opacity. Gradient colors themselves can't be
 *     animated on the UI thread, but opacity can — same visual result.
 *  3. Motion: x and y drift on *different* durations per blob, so the path
 *     is a slow Lissajous curve that takes minutes to visibly repeat.
 *
 * Everything animates via Reanimated shared values on the UI thread — zero
 * React re-renders after mount.
 */

type BlobSpec = {
  /** blob diameter as a fraction of the larger screen dimension */
  size: number;
  /** resting center, as fractions of screen width/height */
  cx: number;
  cy: number;
  /** two hue states to melt between, as "r,g,b" triplets */
  rgbA: string;
  rgbB: string;
  /** alpha at the blob's center */
  peak: number;
  /** drift travel in px and cycle durations in ms (mismatched on purpose) */
  driftX: number;
  driftY: number;
  durX: number;
  durY: number;
  durHue: number;
  /** stagger so blobs don't all launch from their corner pose at once */
  delay: number;
};

const BLOBS: BlobSpec[] = [
  // Big ember mass anchoring the bottom — the "heat source" of the lamp.
  {
    size: 1.05,
    cx: 0.22,
    cy: 0.88,
    rgbA: "255,86,52",
    rgbB: "255,152,40",
    peak: 0.62,
    driftX: 90,
    driftY: 70,
    durX: 17000,
    durY: 23000,
    durHue: 14000,
    delay: 0,
  },
  // Molten gold rising along the right edge, phase-opposed to the ember so
  // the screen always holds both warm hues somewhere.
  {
    size: 0.8,
    cx: 0.86,
    cy: 0.3,
    rgbA: "255,170,60",
    rgbB: "255,96,66",
    peak: 0.5,
    driftX: 80,
    driftY: 110,
    durX: 21000,
    durY: 15000,
    durHue: 18000,
    delay: 2600,
  },
  // Deep teal counterweight mid-screen — cools the composition so the warm
  // blobs read as glow instead of wall-of-orange.
  {
    size: 0.9,
    cx: 0.55,
    cy: 0.55,
    rgbA: "22,168,152",
    rgbB: "48,196,178",
    peak: 0.38,
    driftX: 110,
    driftY: 85,
    durX: 19000,
    durY: 26000,
    durHue: 22000,
    delay: 1200,
  },
  // Small hot accent drifting near the top-left, mostly for sparkle.
  {
    size: 0.45,
    cx: 0.12,
    cy: 0.16,
    rgbA: "255,120,92",
    rgbB: "255,186,84",
    peak: 0.4,
    driftX: 60,
    driftY: 95,
    durX: 13000,
    durY: 20000,
    durHue: 11000,
    delay: 4200,
  },
];

/**
 * Soft radial falloff approximating a gaussian blur: many stops with a long
 * transparent tail. A short tail (few stops, hard cutoff) reads as a visible
 * ring — the "too clear circle" problem — so the fade runs nearly to the rim.
 */
function radialCss(rgb: string, peak: number) {
  const stop = (alpha: number, at: number) =>
    `rgba(${rgb},${(peak * alpha).toFixed(3)}) ${at}%`;
  return (
    `radial-gradient(circle farthest-side at 50% 50%, ` +
    [
      stop(1, 0),
      stop(0.82, 22),
      stop(0.52, 40),
      stop(0.26, 56),
      stop(0.11, 70),
      stop(0.035, 83),
      stop(0, 96),
    ].join(", ") +
    `)`
  );
}

/**
 * RN 0.80+ renders radial gradients natively via the (experimental)
 * `experimental_backgroundImage` style; react-native-web wants the plain CSS
 * `backgroundImage` instead. Neither is in the ViewStyle type yet, hence the
 * cast.
 */
function radialStyle(rgb: string, peak: number) {
  const css = radialCss(rgb, peak);
  return Platform.OS === "web"
    ? ({ backgroundImage: css } as object)
    : ({ experimental_backgroundImage: css } as object);
}

function Blob({ spec, width, height }: { spec: BlobSpec; width: number; height: number }) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const hue = useSharedValue(0);

  useEffect(() => {
    // Yoyo repeats (reverse: true) on mismatched durations — see file header.
    const loop = (duration: number) =>
      withRepeat(
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    x.value = withDelay(spec.delay, loop(spec.durX));
    y.value = withDelay(spec.delay, loop(spec.durY));
    hue.value = withDelay(spec.delay, loop(spec.durHue));
  }, [x, y, hue, spec]);

  const diameter = Math.max(width, height) * spec.size;

  const drift = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(x.value, [0, 1], [-spec.driftX, spec.driftX]) },
      { translateY: interpolate(y.value, [0, 1], [spec.driftY, -spec.driftY]) },
      // Slow swell from the hue driver plus a slight squish from the y
      // driver keeps the silhouette wobbling like heated wax, not a disc.
      { scale: interpolate(hue.value, [0, 1], [1, 1.22]) },
      { scaleY: interpolate(y.value, [0, 1], [1.08, 0.94]) },
    ],
  }));

  // Crossfading the top hue layer is what makes the color itself "melt".
  const hueFade = useAnimatedStyle(() => ({
    opacity: hue.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: diameter,
          height: diameter,
          left: width * spec.cx - diameter / 2,
          top: height * spec.cy - diameter / 2,
        },
        drift,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, radialStyle(spec.rgbA, spec.peak)]} />
      <Animated.View
        style={[StyleSheet.absoluteFill, radialStyle(spec.rgbB, spec.peak), hueFade]}
      />
    </Animated.View>
  );
}

export function LavaBackdrop() {
  const { width, height } = useWindowDimensions();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Deep ink base — dark enough that the blobs read as light sources. */}
      <LinearGradient
        colors={["#050E17", "#081826", "#0C2530"]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.3, y: 0 }}
        end={{ x: 0.6, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {BLOBS.map((spec, i) => (
        <Blob key={i} spec={spec} width={width} height={height} />
      ))}

      {/* Film grain: tiled noise at low opacity breaks up gradient banding
          and kills the too-smooth look. RN's Image (not expo-image) because
          only it supports resizeMode="repeat" tiling. */}
      <Image
        source={require("@/assets/images/grain.png")}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, styles.grain]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  grain: {
    width: undefined,
    height: undefined,
    opacity: 0.05,
  },
});
