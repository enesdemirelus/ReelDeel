import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
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
