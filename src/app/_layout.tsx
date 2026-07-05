import {
  Unbounded_500Medium,
  Unbounded_600SemiBold,
  Unbounded_700Bold,
  Unbounded_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/unbounded";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Unbounded_500Medium,
    Unbounded_600SemiBold,
    Unbounded_700Bold,
    Unbounded_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    // GestureHandlerRootView must wrap the app for react-native-gesture-handler
    // gestures (e.g. the poster-deck swipe) to receive touches.
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* SafeAreaProvider must wrap the app so `useSafeAreaInsets()` works. */}
      <SafeAreaProvider>
        {/* Hide the native Stack header so screens can render full-bleed. */}
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
