import { ExamAlertWorker } from "../../src/modules/exam-alerts/exam-alert.worker";
import type { TestUser } from "./factories";
import { expoToken, openMobileSession, registerDevice } from "./mobile";
import type { TestApp } from "./test-app";

/** A teacher's phone: a MOBILE session with its device registered through `PUT /mobile/device`. */
export async function teacherPhone(t: TestApp, teacher: Pick<TestUser, "id">, pushToken = expoToken()) {
  const { token, sessionId } = await openMobileSession(t, teacher);
  const res = await registerDevice(t, token, pushToken);
  if (res.status !== 200) throw new Error(`device registration failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token, sessionId, pushToken, deviceId: (res.body as { id: string }).id };
}

/** One pass of the alert worker (`EXAM_ALERT_INTERVAL_MS=0` in tests: nothing runs by itself). */
export const runAlertWorker = (t: TestApp, now?: Date) => t.get(ExamAlertWorker).runOnce(now);

/** The messages the fake Expo got for a device token. */
export const pushedTo = (t: TestApp, pushToken: string) => t.push.sent.filter((message) => message.to === pushToken);
