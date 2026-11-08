import { Stack } from "expo-router";

// 024: the root of the app's routes; T011 adds the query client, the theme, the fonts and the
// notification handler.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
