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

const CARD_W = 150;
const CARD_H = 225;
const STACK_W = 320;
const STACK_H = 288;
const BASE_LEFT = (STACK_W - CARD_W) / 2;
const BASE_TOP = (STACK_H - CARD_H) / 2;

const ROTATE_EVERY = 3000;
const SLIDE_DUR = 520;

const PX_PER_SLOT = 80;
const FLING_WEIGHT = 0.0011;

const SLOT_X = [-58, -30, 0, 28, 50];
const SLOT_Y = [-4, 8, 0, 10, -2];
const SLOT_ROT = [-14, -7, -1, 6, 12];
const SLOT_Z = [1, 2, 3, 2, 1];

type Poster = {
  key: string;
  source: number;
  swayX: number;
  swayY: number;
  swayRotate: number;
  duration: number;
  delay: number;
};

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
  {
    key: "godfather",
    source: require("../../assets/posters/godfather.jpg"),
    swayX: 3,
    swayY: 5,
    swayRotate: 1.3,
    duration: 5000,
    delay: 700,
  },
  {
    key: "fight-club",
    source: require("../../assets/posters/fight-club.jpg"),
    swayX: 4,
    swayY: 4,
    swayRotate: 1.2,
    duration: 5800,
    delay: 1100,
  },
  {
    key: "spirited-away",
    source: require("../../assets/posters/spirited-away.jpg"),
    swayX: 3,
    swayY: 6,
    swayRotate: 1,
    duration: 6000,
    delay: 300,
  },
  {
    key: "la-la-land",
    source: require("../../assets/posters/la-la-land.jpg"),
    swayX: 4,
    swayY: 5,
    swayRotate: 1.4,
    duration: 4600,
    delay: 1500,
  },
  {
    key: "whiplash",
    source: require("../../assets/posters/whiplash.jpg"),
    swayX: 3,
    swayY: 4,
    swayRotate: 1.1,
    duration: 5400,
    delay: 600,
  },
  {
    key: "matrix",
    source: require("../../assets/posters/matrix.jpg"),
    swayX: 4,
    swayY: 6,
    swayRotate: 1.3,
    duration: 5000,
    delay: 1800,
  },
];

const COUNT = POSTERS.length;

const POSE_IN = [0, 1, 2, 3, 4, 4.45, COUNT - 0.55, COUNT];
const POSE_X = [...SLOT_X, SLOT_X[4] + 70, SLOT_X[0] - 70, SLOT_X[0]];
const POSE_Y = [...SLOT_Y, SLOT_Y[4], SLOT_Y[0], SLOT_Y[0]];
const POSE_ROT = [...SLOT_ROT, SLOT_ROT[4] + 6, SLOT_ROT[0] - 6, SLOT_ROT[0]];
const POSE_Z = [...SLOT_Z, 0, 0, 1];
const FADE_IN = [0, 4, 4.3, COUNT - 0.3, COUNT];
const FADE_OUT = [1, 1, 0, 0, 1];

function slotFor(index: number, turn: number) {
  "worklet";
  return (((index - turn) % COUNT) + COUNT) % COUNT;
}

type CarryState = {
  index: SharedValue<number>;
  x: SharedValue<number>;
  y: SharedValue<number>;
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
  turn: SharedValue<number>;
  carry: CarryState;
}) {
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
        true,
      ),
    );
  }, [sway, poster.delay, poster.duration]);

  const style = useAnimatedStyle(() => {
    const slot = slotFor(index, turn.value);
    const held = carry.index.value === index;
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

export function PosterStack() {
  const autoTurn = useSharedValue(0);
  const swipeTurn = useSharedValue(0);
  const turn = useDerivedValue(() => autoTurn.value + swipeTurn.value);

  const swipeBase = useSharedValue(0);

  const carryIndex = useSharedValue(-1);
  const carryX = useSharedValue(0);
  const carryY = useSharedValue(0);
  const carryLift = useSharedValue(0);

  const touches = useSharedValue(0);
  const deckPaused = useDerivedValue(() => touches.value > 0);
  const nextRotateAt = useSharedValue(ROTATE_EVERY);

  useFrameCallback((frame) => {
    const now = frame.timeSinceFirstFrame;
    if (deckPaused.value) {
      nextRotateAt.value = now + ROTATE_EVERY;
      return;
    }
    if (now >= nextRotateAt.value) {
      nextRotateAt.value = now + ROTATE_EVERY;
      autoTurn.value = withTiming(autoTurn.value + 1, {
        duration: SLIDE_DUR,
        easing: Easing.inOut(Easing.quad),
      });
    }
  });

  const swipe = Gesture.Pan()
    .maxPointers(1)
    .activeOffsetX([-15, 15])
    .onBegin(() => {
      "worklet";
      touches.value += 1;
    })
    .onStart(() => {
      "worklet";
      swipeBase.value = swipeTurn.value;
    })
    .onUpdate((e) => {
      "worklet";
      swipeTurn.value = swipeBase.value - e.translationX / PX_PER_SLOT;
    })
    .onEnd((e) => {
      "worklet";
      const projected = swipeTurn.value - e.velocityX * FLING_WEIGHT;
      const maxSkip = 3;
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

  const carry = Gesture.Pan()
    .maxPointers(1)
    .activateAfterLongPress(280)
    .onBegin(() => {
      "worklet";
      touches.value += 1;
    })
    .onStart(() => {
      "worklet";
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
      const springHome = { damping: 15, stiffness: 130 };
      carryX.value = withSpring(0, { ...springHome, velocity: e.velocityX });
      carryY.value = withSpring(0, { ...springHome, velocity: e.velocityY });
      carryLift.value = withSpring(0, springHome, (finished) => {
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
    overflow: "visible",
  },
  card: {
    position: "absolute",
    left: BASE_LEFT,
    top: BASE_TOP,
    width: CARD_W,
    height: CARD_H,
    borderRadius: 17,
    backgroundColor: "#15121F",
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
