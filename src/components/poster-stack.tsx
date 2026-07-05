import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

// Single card geometry and the (larger) box the fanned deck lives in. The box
// is bigger than a card so the outer cards can splay/rotate without clipping.
const CARD_W = 150;
const CARD_H = 225;
const STACK_W = 320;
const STACK_H = 288;
const BASE_LEFT = (STACK_W - CARD_W) / 2;
const BASE_TOP = (STACK_H - CARD_H) / 2;

const COUNT = 5;
// Time between automatic rotations, and how long an auto-rotation's slide
// takes. Raise ROTATE_EVERY to make the deck calmer.
const ROTATE_EVERY = 3000;
const SLIDE_DUR = 520;

// Horizontal finger travel (px) that equals one slot of rotation while
// dragging. Bigger = less touchy.
const PX_PER_SLOT = 80;
// How much fling velocity carries into extra slots (slots per px/s of
// velocity). Tuned so a solid flick skips 1-2 extra posters, no more.
const FLING_WEIGHT = 0.0011;

// The fan, ordered left-to-right by resting X, with the centre card on top.
// Slot 2 is the "front" (fully visible). Rotation shifts every card one slot;
// the front card moves left and the card on its right becomes the new front.
const SLOT_X = [-58, -30, 0, 28, 50];
const SLOT_Y = [-4, 8, 0, 10, -2];
const SLOT_ROT = [-14, -7, -1, 6, 12]; // degrees
const SLOT_Z = [1, 2, 3, 2, 1]; // centre paints on top, outer cards behind

// Cards derive their pose from a CONTINUOUS fractional slot value (see
// slotFor below), interpolated over these node arrays. Inputs 0..4 are the
// real slots; the (4, 5) segment is the wrap-around, where a card slides off
// the LEFT edge and re-enters from the RIGHT. The position jump at 4.45→4.55
// is hidden inside the zero-opacity window [4.3, 4.7].
const POSE_IN = [0, 1, 2, 3, 4, 4.45, 4.55, 5];
const POSE_X = [...SLOT_X, SLOT_X[4] + 70, SLOT_X[0] - 70, SLOT_X[0]];
const POSE_Y = [...SLOT_Y, SLOT_Y[4], SLOT_Y[0], SLOT_Y[0]];
const POSE_ROT = [...SLOT_ROT, SLOT_ROT[4] + 6, SLOT_ROT[0] - 6, SLOT_ROT[0]];
const POSE_Z = [...SLOT_Z, 0, 0, 1];
const FADE_IN = [0, 4, 4.3, 4.7, 5];
const FADE_OUT = [1, 1, 0, 0, 1];

type Poster = {
  key: string;
  source: number;
  // A small idle wobble so the deck stays alive between rotations. Out-of-phase
  // timing keeps it organic.
  swayX: number;
  swayY: number;
  swayRotate: number; // degrees
  duration: number;
  delay: number;
};

// Order = initial left-to-right placement (index i starts in slot i), which
// reproduces the liked fan: parasite far-left … inception centre/top …
// interstellar far-right. Assets are required relative to this file — `require`
// returns the Metro asset id, the resolution path guaranteed to work at runtime.
const POSTERS: Poster[] = [
  {
    key: "parasite",
    source: require("../../assets/posters/parasite.jpg"),
    swayX: 4,
    swayY: 6,
    swayRotate: 1.5,
    duration: 5600,
    delay: 0,
  },
  {
    key: "dark-knight",
    source: require("../../assets/posters/dark-knight.jpg"),
    swayX: 4,
    swayY: 4,
    swayRotate: 1.4,
    duration: 4800,
    delay: 400,
  },
  {
    key: "inception",
    source: require("../../assets/posters/inception.jpg"),
    swayX: 3,
    swayY: 4,
    swayRotate: 1.2,
    duration: 4400,
    delay: 200,
  },
  {
    key: "pulp-fiction",
    source: require("../../assets/posters/pulp-fiction.jpg"),
    swayX: 3,
    swayY: 5,
    swayRotate: 1,
    duration: 5200,
    delay: 1300,
  },
  {
    key: "interstellar",
    source: require("../../assets/posters/interstellar.jpg"),
    swayX: 4,
    swayY: 5,
    swayRotate: 1.1,
    duration: 6200,
    delay: 900,
  },
];

// The card's current (fractional) slot as a function of the shared rotation
// value. Higher `turn` shifts cards toward lower slots — front card moves left.
function slotFor(index: number, turn: number) {
  "worklet";
  return (((index - turn) % COUNT) + COUNT) % COUNT;
}

type CarryState = {
  /** index of the poster currently held by the user, or -1 */
  index: SharedValue<number>;
  /** finger offset from the card's resting pose */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** 0 = resting, 1 = fully "picked up" (drives lift scale) */
  lift: SharedValue<number>;
};

function PosterCard({
  poster,
  index,
  turn,
  carry,
}: {
  poster: Poster;
  index: number;
  // Shared continuous rotation value owned by the deck; every card derives
  // its pose from it each frame.
  turn: SharedValue<number>;
  carry: CarryState;
}) {
  // Private idle wobble driver (independent of rotations).
  const sway = useSharedValue(0);

  useEffect(() => {
    sway.value = withDelay(
      poster.delay,
      withRepeat(
        withTiming(1, {
          duration: poster.duration,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true, // yoyo
      ),
    );
  }, [sway, poster.delay, poster.duration]);

  const style = useAnimatedStyle(() => {
    const slot = slotFor(index, turn.value);
    const held = carry.index.value === index;
    // The held card's lift persists through its return spring (carry.index
    // only clears once `lift` lands back at 0), so no pose pop on release.
    const lift = held ? carry.lift.value : 0;

    return {
      zIndex: held ? 20 : Math.round(interpolate(slot, POSE_IN, POSE_Z)),
      opacity: interpolate(slot, FADE_IN, FADE_OUT),
      transform: [
        {
          translateX:
            interpolate(slot, POSE_IN, POSE_X) +
            (held ? carry.x.value : 0) +
            interpolate(sway.value, [0, 1], [-poster.swayX, poster.swayX]),
        },
        {
          translateY:
            interpolate(slot, POSE_IN, POSE_Y) +
            (held ? carry.y.value : 0) +
            interpolate(sway.value, [0, 1], [-poster.swayY, poster.swayY]),
        },
        {
          // Picking a card up levels it out (rotation eases toward 0) — it
          // reads as lifting the poster off the pile.
          rotate: `${
            interpolate(slot, POSE_IN, POSE_ROT) * (1 - lift * 0.85) +
            interpolate(sway.value, [0, 1], [-poster.swayRotate, poster.swayRotate])
          }deg`,
        },
        { scale: 1 + lift * 0.14 },
      ],
    };
  });

  return (
    <Animated.View style={[styles.card, style]}>
      <Image
        source={poster.source}
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    </Animated.View>
  );
}

const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
const grabBuzz = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

/**
 * A decorative pile of famous movie posters for the welcome screen.
 *
 * The whole deck is driven by ONE continuous value, `turn`: each card maps it
 * to a fractional slot and interpolates its pose (see POSE_* arrays). That
 * means dragging tracks the finger 1:1 mid-rotation, release settles with a
 * velocity-aware spring, and fast repeated swipes just keep adding to the
 * same value — no queued animations to fight each other.
 *
 * Two gestures race:
 *  - flick/drag horizontally  -> rotate the fan (velocity can skip posters)
 *  - hold ~0.3s, then drag    -> pick the front poster up and carry it
 *                                anywhere; release springs it home.
 */
export function PosterStack() {
  // `turn` is split into per-owner shared values (each mutated from a single
  // place) and summed in a derived value. Sharing one mutable counter between
  // an effect and a gesture is what the React Compiler's immutability rule
  // forbids, so keep the sources separate.
  const autoTurn = useSharedValue(0);
  const swipeTurn = useSharedValue(0);
  const turn = useDerivedValue(() => autoTurn.value + swipeTurn.value);

  // Where the drag started from, so onUpdate is absolute (base + travel)
  // rather than incremental — immune to dropped frames.
  const swipeBase = useSharedValue(0);

  // Carry state (see CarryState).
  const carryIndex = useSharedValue(-1);
  const carryX = useSharedValue(0);
  const carryY = useSharedValue(0);
  const carryLift = useSharedValue(0);

  // Number of fingers currently on the deck. A COUNTER, not a boolean: both
  // racing gestures fire onBegin/onFinalize, and the race's loser finalizes
  // early (while the winner is still going). The frame callback below must
  // read it through a derived value: the React Compiler treats the frame
  // callback as an effect and forbids gesture-mutated values in its closure,
  // but a derived value is a legal read-through.
  const touches = useSharedValue(0);
  const deckPaused = useDerivedValue(() => touches.value > 0);
  const nextRotateAt = useSharedValue(ROTATE_EVERY);

  // Auto-rotate timer, run entirely on the UI thread. While the user is
  // touching the deck the deadline keeps sliding forward, which also means a
  // rotation never fires the instant a finger lifts.
  useFrameCallback((frame) => {
    const now = frame.timeSinceFirstFrame;
    if (deckPaused.value) {
      nextRotateAt.value = now + ROTATE_EVERY;
      return;
    }
    if (now >= nextRotateAt.value) {
      nextRotateAt.value = now + ROTATE_EVERY;
      // +1 = left, so the front poster keeps drifting left as new ones arrive.
      autoTurn.value = withTiming(autoTurn.value + 1, {
        duration: SLIDE_DUR,
        easing: Easing.inOut(Easing.quad),
      });
    }
  });

  // Drag rotates the fan live; release snaps to the nearest slot, letting
  // fling velocity carry it a poster or two further (clamped so a hard flick
  // can't spin the deck into a blur).
  const swipe = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX([-15, 15])
    .onBegin(() => {
      "worklet";
      touches.value += 1;
    })
    .onStart(() => {
      "worklet";
      // Capture mid-spring value so a new drag grabs the deck where it
      // currently is — this is what makes rapid successive swipes feel right.
      swipeBase.value = swipeTurn.value;
    })
    .onUpdate((e) => {
      "worklet";
      swipeTurn.value = swipeBase.value - e.translationX / PX_PER_SLOT;
    })
    .onEnd((e) => {
      "worklet";
      const projected = swipeTurn.value - e.velocityX * FLING_WEIGHT;
      const maxSkip = 3; // relative to where the drag started
      const target = Math.round(
        Math.min(
          Math.max(projected, swipeBase.value - maxSkip),
          swipeBase.value + maxSkip,
        ),
      );
      swipeTurn.value = withSpring(target, {
        damping: 18,
        stiffness: 160,
        velocity: -e.velocityX / PX_PER_SLOT,
      });
      if (target !== Math.round(swipeBase.value)) runOnJS(tick)();
    })
    .onFinalize(() => {
      "worklet";
      touches.value -= 1;
    });

  // Hold, then drag: the front poster lifts off the pile and follows the
  // finger anywhere on screen; letting go springs it back to the middle.
  // activateAfterLongPress fails this pan if the finger moves early, so a
  // quick horizontal flick still wins the race and rotates instead.
  const carry = Gesture.Pan()
    .maxPointers(1)
    .activateAfterLongPress(280)
    .onBegin(() => {
      "worklet";
      touches.value += 1;
    })
    .onStart(() => {
      "worklet";
      // Grab whichever poster is in front right now. `turn` is (near-)integer
      // here because the auto-timer pauses on touch and any swipe has settled.
      // Double-mod: JS `%` goes negative when right-swipes drive turn below 0.
      carryIndex.value =
        (((Math.round(turn.value) + 2) % COUNT) + COUNT) % COUNT;
      carryX.value = 0;
      carryY.value = 0;
      carryLift.value = withSpring(1, { damping: 16, stiffness: 220 });
      runOnJS(grabBuzz)();
    })
    .onUpdate((e) => {
      "worklet";
      carryX.value = e.translationX;
      carryY.value = e.translationY;
    })
    .onEnd((e) => {
      "worklet";
      // Hand the finger's velocity to the return spring so the poster keeps
      // its momentum for a beat before curving home — feels thrown, not reset.
      const springHome = { damping: 15, stiffness: 130 };
      carryX.value = withSpring(0, { ...springHome, velocity: e.velocityX });
      carryY.value = withSpring(0, { ...springHome, velocity: e.velocityY });
      carryLift.value = withSpring(0, springHome, (finished) => {
        // Keep the card marked as "held" until it has fully landed, so the
        // return trip renders with the lifted zIndex (above its neighbours).
        if (finished) carryIndex.value = -1;
      });
      runOnJS(tick)();
    })
    .onFinalize(() => {
      "worklet";
      touches.value -= 1;
    });

  const carryState: CarryState = {
    index: carryIndex,
    x: carryX,
    y: carryY,
    lift: carryLift,
  };

  return (
    <GestureDetector gesture={Gesture.Race(carry, swipe)}>
      <View style={styles.stack}>
        {POSTERS.map((poster, index) => (
          <PosterCard
            key={poster.key}
            poster={poster}
            index={index}
            turn={turn}
            carry={carryState}
          />
        ))}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: STACK_W,
    height: STACK_H,
    overflow: "visible", // cards splay/rotate beyond a single card's box
  },
  card: {
    position: "absolute",
    left: BASE_LEFT,
    top: BASE_TOP,
    width: CARD_W,
    height: CARD_H,
    borderRadius: 17,
    backgroundColor: "#15121F", // shows (dark) until the image decodes
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
});
