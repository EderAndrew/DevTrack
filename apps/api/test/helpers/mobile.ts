import { randomBytes } from "node:crypto";
import type { MobilePlatform } from "@repo/contracts";
import { SessionService } from "../../src/modules/auth/session.service";
import { createActivity } from "./activities";
import type { TestUser } from "./factories";
import { api, type TestApp } from "./test-app";

/**
 * 024 test helpers: the app's sign-in and its bearer client, devices, and EXAM activities in or out of
 * progress for `GET /mobile/exams`.
 */

/** `POST /auth/mobile/sessions` as the app sends it: no Origin, JSON. */
export function mobileLogin(t: TestApp, email: string, password: string) {
  return api(t, { origin: null }).post("/api/auth/mobile/sessions", { email, password });
}

/** Signs a user in through the app's route; returns the session's secret. */
export async function signInMobile(t: TestApp, user: Pick<TestUser, "email" | "password">): Promise<string> {
  const res = await mobileLogin(t, user.email, user.password);
  if (res.status !== 201) throw new Error(`mobile login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body as { token: string }).token;
}

/** A MOBILE session straight in the database (no login, no audit); returns the secret. */
export async function openMobileSession(t: TestApp, user: Pick<TestUser, "id">): Promise<{ token: string; sessionId: string }> {
  const sessions = t.get(SessionService);
  const created = await t.prisma.runInTransaction((tx) => sessions.create(tx, user.id, new Date(), "MOBILE"));
  return { token: created.secret, sessionId: created.sessionId };
}

/** The app's client: the bearer, no Origin, no cookie. */
export const mobileApi = (t: TestApp, token: string) => api(t, { origin: null, bearer: token });

export const expoToken = () => `ExponentPushToken[${randomBytes(12).toString("hex")}]`;

/** `PUT /mobile/device` for the bearer's session. */
export function registerDevice(t: TestApp, token: string, pushToken = expoToken(), platform: MobilePlatform = "ANDROID") {
  return mobileApi(t, token).put("/api/mobile/device", { pushToken, platform });
}

const MINUTE = 60_000;

/**
 * An EXAM of the class with its timing relative to now: `startedMinutesAgo` since the publication
 * (negative = scheduled), 15 min start window and 60 min duration, so it is in progress until 75 min
 * after the publication.
 */
export function examActivity(
  t: TestApp,
  schoolClass: { id: string; teacherId: string },
  options: { startedMinutesAgo?: number; title?: string; status?: "ACTIVE" | "CLOSED" | "CANCELLED" } = {},
) {
  return createActivity(t, schoolClass, {
    type: "EXAM",
    title: options.title ?? "Prova de teste",
    publishAt: new Date(Date.now() - (options.startedMinutesAgo ?? 5) * MINUTE),
    status: options.status ?? "ACTIVE",
    durationMinutes: 60,
    startWindowMinutes: 15,
  });
}
