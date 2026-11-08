import { ExamAlertPushDataSchema } from "@repo/contracts";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";

/**
 * With the app open (contracts/mobile-ui.md "Push"): the alert is still shown and sounds once, as in the
 * background, and the phone vibrates by its kind — strong for a hold, a tap for an occurrence (expo-haptics).
 */
export function configureForegroundAlerts(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export async function vibrateFor(notification: Notifications.Notification): Promise<void> {
  const parsed = ExamAlertPushDataSchema.safeParse(notification.request.content.data);
  if (!parsed.success) return;
  if (parsed.data.kind === "HOLD") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  else await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}
