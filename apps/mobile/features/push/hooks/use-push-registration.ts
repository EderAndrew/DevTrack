import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { registerDevice } from "../api/devices";
import { ensureExamChannels } from "../channels";

export type NotificationPermission = "granted" | "denied" | "undetermined";

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

async function registerThisPhone(): Promise<void> {
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
  await registerDevice(data, Platform.OS === "ios" ? "IOS" : "ANDROID");
}

/**
 * After the sign-in (024 contracts/mobile-ui.md "Push"): creates the channels, asks for the notification
 * permission, gets the Expo push token and registers it for this session; again when the token changes.
 * The permission is read again whenever the app comes back to the foreground (US1-7: turned off in the
 * phone's settings). A failure here never blocks the room; the API's state is the truth.
 */
export function usePushRegistration(enabled: boolean): NotificationPermission | null {
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  const register = useCallback(async () => {
    try {
      await registerThisPhone();
    } catch {
      // No push token (no Google services, offline): the room still works; the next opening tries again.
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void (async () => {
      await ensureExamChannels();
      let { status } = await Notifications.getPermissionsAsync();
      if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
      if (!active) return;
      setPermission(status);
      if (status === "granted") await register();
    })();

    const tokenChange = Notifications.addPushTokenListener(() => void register());
    const foreground = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void Notifications.getPermissionsAsync().then(({ status }) => {
        if (active) setPermission(status);
      });
    });
    return () => {
      active = false;
      tokenChange.remove();
      foreground.remove();
    };
  }, [enabled, register]);

  return permission;
}
