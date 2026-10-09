import { z } from "zod";

// What a CONTROLLED attempt records (015 data-model.md, research F4–F7). Facts only: the teacher
// interprets them (constitution X); no value here means fraud.

/** Every event type, as stored. `TYPING_LIMIT_EXCEEDED` is written by the server only (F7). */
export const IntegrityEventTypeSchema = z.enum([
  "SCREEN_LEFT",
  "SCREEN_RETURNED",
  "FULLSCREEN_EXITED",
  "FULLSCREEN_ENTERED",
  "PAGE_LEAVE_ATTEMPTED",
  "CONNECTION_LOST",
  "CONNECTION_RESTORED",
  "PASTE_BLOCKED",
  "COPY_BLOCKED",
  "CUT_BLOCKED",
  "DROP_BLOCKED",
  "TYPING_LIMIT_EXCEEDED",
  "FULLSCREEN_UNAVAILABLE",
  "DETECTION_UNAVAILABLE",
]);
export type IntegrityEventType = z.infer<typeof IntegrityEventTypeSchema>;

/** The types the browser may send (`POST /me/activities/:activityId/attempt/events`). */
export const ClientIntegrityEventTypeSchema = IntegrityEventTypeSchema.exclude(["TYPING_LIMIT_EXCEEDED"]);
export type ClientIntegrityEventType = z.infer<typeof ClientIntegrityEventTypeSchema>;

/** The types tied to one question: a blocked clipboard gesture in its field (F6). */
export const QUESTION_EVENT_TYPES: readonly IntegrityEventType[] = ["PASTE_BLOCKED", "COPY_BLOCKED", "CUT_BLOCKED", "DROP_BLOCKED", "TYPING_LIMIT_EXCEEDED"];

/** A derived interval of the timeline: away from the screen, out of fullscreen, without connection. */
export const IntegrityIntervalKindSchema = z.enum(["SCREEN", "FULLSCREEN", "CONNECTION"]);
export type IntegrityIntervalKind = z.infer<typeof IntegrityIntervalKindSchema>;
