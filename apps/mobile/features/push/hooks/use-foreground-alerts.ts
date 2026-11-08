import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { configureForegroundAlerts, vibrateFor } from "../foreground";

/** Shows and vibrates the alerts received while the app is open (024/US3-1, US3-2). */
export function useForegroundAlerts(): void {
  useEffect(() => {
    configureForegroundAlerts();
    const subscription = Notifications.addNotificationReceivedListener((notification) => void vibrateFor(notification));
    return () => subscription.remove();
  }, []);
}
