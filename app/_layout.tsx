import { QueryClientProvider } from "@tanstack/react-query";
import { SplashScreen, Stack } from "expo-router";
import * as NativeSplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { NotesProvider } from "@/context/NotesContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { requestNotificationPermissions, scheduleDailyReminder } from "@/lib/notifications";
import { View } from "react-native";
import AnimatedSplashScreen from "@/components/AnimatedSplashScreen";
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from "@expo-google-fonts/playfair-display";
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from "@expo-google-fonts/dm-sans";
import { LogBox } from "react-native";

SplashScreen.preventAutoHideAsync();

// Ignore known external library warnings
LogBox.ignoreLogs([
  'A props object containing a "key" prop is being spread into JSX', // react-native-markdown-display internal FitImage
]);

// ── Suppress ONNX Runtime JSI install errors in dev mode ──────────────────────
// The native library throws a synchronous JSI error when it can't load on an
// unsupported architecture (e.g. x86_64 emulator). React Native's dev overlay
// intercepts it before our try-catch chain completes. This filter silences the
// overlay so the graceful error message in the UI appears instead.
if (__DEV__) {
  const _prevHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
  (global as any).ErrorUtils?.setGlobalHandler?.((error: Error, isFatal: boolean) => {
    if (error?.message?.includes("install") && error?.message?.includes("null")) {
      // ONNX JSI install error — already handled gracefully in onnxEmbeddings.ts
      return;
    }
    _prevHandler?.(error, isFatal);
  });
}

function RootLayoutNav() {
  const { colors } = useTheme();

  useEffect(() => {
    // Request notification permissions and schedule daily 8AM reminder
    requestNotificationPermissions().then(granted => {
      if (granted) scheduleDailyReminder(8, 0);
    });
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="folder/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="topic/[folderId]/[noteId]/[topicIndex]" options={{ headerShown: false, animation: "slide_from_bottom" }} />
      <Stack.Screen name="story" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [showSplash, setShowSplash] = useState(true);

  const [fontsLoaded, fontError] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // We don't hide the native splash here anymore.
      // We'll hide it once the RootLayout has rendered the first frame of our custom splash.
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0F0E0D' }}>
            <KeyboardProvider>
              <NotesProvider>
                <View style={{ flex: 1, backgroundColor: '#0F0E0D' }}>
                  <RootLayoutNav />
                  {showSplash && (
                    <AnimatedSplashScreen
                      onAnimationFinish={() => setShowSplash(false)}
                      onReady={() => NativeSplashScreen.hideAsync()}
                    />
                  )}
                </View>
              </NotesProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
