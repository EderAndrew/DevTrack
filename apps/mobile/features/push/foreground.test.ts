import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { configureForegroundAlerts, vibrateFor } from "./foreground";

jest.mock("expo-notifications", () => ({ setNotificationHandler: jest.fn() }));
jest.mock("expo-haptics", () => ({
  NotificationFeedbackType: { Warning: "warning" },
  ImpactFeedbackStyle: { Heavy: "heavy" },
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
}));

const notification = (kind: string) =>
  ({
    request: {
      content: {
        data: {
          kind,
          classId: "00000000-0000-4000-8000-0000000000c1",
          activityId: "00000000-0000-4000-8000-0000000000a1",
          studentUserId: "00000000-0000-4000-8000-000000000101",
        },
      },
    },
  }) as unknown as Notifications.Notification;

describe("024/US3-1 024/US3-2 aviso recebido com o app aberto", () => {
  beforeEach(() => jest.clearAllMocks());

  it("024/US3-1 com o app aberto o aviso aparece e toca uma vez (sem som duplicado)", async () => {
    configureForegroundAlerts();
    const handler = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0]![0] as { handleNotification: () => Promise<object> };
    expect(await handler.handleNotification()).toEqual({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false });
  });

  it("024/US3-2 a prova retida vibra forte; uma ocorrência vibra um toque; outra notificação não vibra", async () => {
    await vibrateFor(notification("HOLD"));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith("warning");
    await vibrateFor(notification("OCCURRENCE"));
    expect(Haptics.impactAsync).toHaveBeenCalledWith("heavy");
    await vibrateFor(notification("OUTRA"));
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });
});
