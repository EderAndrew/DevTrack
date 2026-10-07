import { randomUUID } from "node:crypto";
import type { ClientIntegrityEventType, IntegrityEventInput } from "@repo/contracts";
import type { api } from "./test-app";

// ── 015: the controlled mode's routes (contracts/http-api.md), for the US2, US4 and US5 suites ──

type ApiClient = ReturnType<typeof api>;

/**
 * One event as the browser sends it: a fresh `eventId`, the browser's time now and not buffered,
 * unless overridden (a buffered event keeps its own `clientOccurredAt`).
 */
export function integrityEvent(type: ClientIntegrityEventType, overrides: Partial<IntegrityEventInput> = {}): IntegrityEventInput {
  return { eventId: randomUUID(), type, clientOccurredAt: new Date().toISOString(), buffered: false, ...overrides };
}

/** `POST /me/activities/:activityId/attempt/events` as the student of `client` (1–50 events). */
export function recordEvents(client: ApiClient, activityId: string, events: IntegrityEventInput[]) {
  return client.post(`/api/me/activities/${activityId}/attempt/events`, { events });
}

/** `GET /me/activities/:activityId/attempt/integrity`: the student's own events and totals (015/US5). */
export function getOwnIntegrity(client: ApiClient, activityId: string) {
  return client.get(`/api/me/activities/${activityId}/attempt/integrity`);
}

/** `GET /classes/:classId/activities/:activityId/integrity`: one summary per student with an attempt (015/US4). */
export function getIntegritySummary(client: ApiClient, classId: string, activityId: string) {
  return client.get(`/api/classes/${classId}/activities/${activityId}/integrity`);
}

/** `GET …/attempts/:attemptId/integrity`: the attempt's timeline with the derived intervals (015/US4). */
export function getTimeline(client: ApiClient, classId: string, activityId: string, attemptId: string) {
  return client.get(`/api/classes/${classId}/activities/${activityId}/attempts/${attemptId}/integrity`);
}
