import { type ExamAlertPushData, ExamAlertPushDataSchema } from "@repo/contracts";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useSession } from "../../../lib/session/session-provider";

/** The room of an alert, the student highlighted (024/US3-5, contracts/push-notifications.md "Opening an alert"). */
export const roomOfAlert = (data: ExamAlertPushData) =>
  ({ pathname: "/provas/[classId]/[activityId]", params: { classId: data.classId, activityId: data.activityId, aluno: data.studentUserId } }) as const;

/** The alert's data, only when it is exactly the contract's (ids validated): anything else is ignored. */
export function alertDataOf(response: Notifications.NotificationResponse | null): ExamAlertPushData | null {
  const parsed = ExamAlertPushDataSchema.safeParse(response?.notification.request.content.data);
  return parsed.success ? parsed.data : null;
}

/**
 * Tapping an alert (024/US3-5, FR-017): with the app closed, in the background or open, the room of that exam
 * opens with the student highlighted; without a session, "Entrar" first and the room right after the login.
 * The room itself is read from the API, which checks the teacher's access again.
 */
export function useNotificationResponse(): void {
  const router = useRouter();
  const { status } = useSession();
  const pending = useRef<ExamAlertPushData | null>(null);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const data = alertDataOf(response);
      if (!data) return;
      if (statusRef.current === "signedIn") {
        router.push(roomOfAlert(data));
      } else {
        pending.current = data;
        if (statusRef.current === "signedOut") router.replace("/entrar");
      }
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (!pending.current) return;
    if (status === "signedIn") {
      const data = pending.current;
      pending.current = null;
      router.push(roomOfAlert(data));
    } else if (status === "signedOut") {
      router.replace("/entrar");
    }
  }, [status, router]);
}
