import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * The two Android channels of the alerts (024 research Y7, contracts/push-notifications.md): the push
 * names its channel. Both PRIVATE on the lock screen — a locked phone shows only "DevTrack" and "Conteúdo
 * oculto", never the student's name (US3-8). The hold vibrates longer and at the highest importance.
 */
export const EXAM_CHANNELS = {
  "exam-occurrences": {
    name: "Ocorrências na prova",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
  },
  "exam-holds": {
    name: "Provas retidas",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 600, 200, 600, 200, 600],
  },
} as const;

export type ExamChannelId = keyof typeof EXAM_CHANNELS;

export async function ensureExamChannels(platform: string = Platform.OS): Promise<void> {
  if (platform !== "android") return;
  for (const [id, channel] of Object.entries(EXAM_CHANNELS)) {
    await Notifications.setNotificationChannelAsync(id, {
      ...channel,
      vibrationPattern: [...channel.vibrationPattern],
      sound: "default",
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
}
