import type { ExpoConfig } from "expo/config";

// 024 (research Y1, contracts/configuration.md): Android first, internal distribution through EAS.
// EXPO_PUBLIC_API_ORIGIN comes from the EAS profile (eas.json). Cleartext (http://10.0.2.2:4000, the
// emulator's host) only for local development: an EAS build of any other profile must talk to the API over
// HTTPS, or the session's bearer would travel in clear (OWASP audit of T004, A05).
const DEVELOPMENT_ORIGIN = "http://10.0.2.2:4000";
const buildProfile = process.env.EAS_BUILD_PROFILE;
const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? DEVELOPMENT_ORIGIN;
if (buildProfile !== undefined && buildProfile !== "development" && !apiOrigin.startsWith("https://")) {
  throw new Error(`EXPO_PUBLIC_API_ORIGIN must be https:// in the "${buildProfile}" profile`);
}
const easProjectId = process.env.EAS_PROJECT_ID;
// The Firebase app's google-services.json (FCM token on Android) is an EAS file variable, never in the repository
// (docs/deploy/mobile.md §2); without it the build still works and push registration just fails.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

const config: ExpoConfig = {
  name: "DevTrack",
  slug: "devtrack",
  scheme: "devtrack",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon/icon.png",
  android: {
    package: "br.com.nativcode.devtrack",
    ...(googleServicesFile ? { googleServicesFile } : {}),
    // Foreground inside the 66% safe zone over the icon's navy; monochrome for Android 13+ themed icons.
    adaptiveIcon: {
      foregroundImage: "./assets/icon/adaptive-icon.png",
      monochromeImage: "./assets/icon/adaptive-icon-monochrome.png",
      backgroundColor: "#030535",
    },
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
