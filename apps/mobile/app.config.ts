import type { ExpoConfig } from "expo/config";

// 024 (research Y1, contracts/configuration.md): Android first, internal distribution through EAS.
// EXPO_PUBLIC_API_ORIGIN comes from the EAS profile (eas.json); http://10.0.2.2:4000 only in development.
const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? "http://10.0.2.2:4000";
const easProjectId = process.env.EAS_PROJECT_ID;

const config: ExpoConfig = {
  name: "DevTrack",
  slug: "devtrack",
  scheme: "devtrack",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  android: {
    package: "br.com.nativcode.devtrack",
    // Only what push, haptics and the network need; no location, camera or contacts.
    permissions: ["android.permission.POST_NOTIFICATIONS", "android.permission.VIBRATE"],
    blockedPermissions: ["android.permission.ACCESS_FINE_LOCATION", "android.permission.CAMERA", "android.permission.RECORD_AUDIO"],
  },
  ios: {
    bundleIdentifier: "br.com.nativcode.devtrack",
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-notifications", { defaultChannel: "exam-occurrences" }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    apiOrigin,
    ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
  },
};

export default config;
