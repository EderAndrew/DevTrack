import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useMe } from "../features/mobile-auth/hooks/use-me";
import { createQueryClient } from "../lib/query-client";
import { SessionProvider } from "../lib/session/session-provider";
import { FONT_FILES, ThemeProvider, useTheme } from "../lib/theme";

/**
 * The root of the app (024 contracts/mobile-ui.md): the query client, the session, the theme (dark until
 * the session's `GET /me` says otherwise, 022), the Design System's fonts and the routes. Nothing is shown
 * before the fonts load, so no screen flashes in a system font.
 */
export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded] = useFonts(FONT_FILES);
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <AccountTheme />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function AccountTheme() {
  const me = useMe();
  return (
    <ThemeProvider theme={me.data?.theme}>
      <ThemedStack />
    </ThemeProvider>
  );
}

function ThemedStack() {
  const { name, colors } = useTheme();
  return (
    <>
      <StatusBar style={name === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />
    </>
  );
}
