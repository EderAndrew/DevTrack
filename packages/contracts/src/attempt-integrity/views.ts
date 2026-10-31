import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { TeacherExamHoldSchema } from "../exam-sessions/holds.js";
import { IntegrityEventTypeSchema, IntegrityIntervalKindSchema } from "./enums.js";

// What the teacher and the student see of a CONTROLLED attempt (015 research F13). Counts and
// durations are derived on every read from the stored events; nothing labels the student.

const count = z.int().min(0);

/** The totals of one attempt (015/FR-024). */
export const IntegrityTotalsSchema = z.strictObject({
  screenExits: count,
  timeAwaySeconds: count,
  fullscreenExits: count,
  disconnections: count,
  offlineSeconds: count,
  clipboardBlocks: count,
  typingLimitRejections: count,
  fullscreenUnavailable: z.boolean(),
  detectionUnavailable: z.boolean(),
});
export type IntegrityTotals = z.infer<typeof IntegrityTotalsSchema>;

/** One student of `GET /classes/:classId/activities/:activityId/integrity`. */
export const IntegritySummarySchema = IntegrityTotalsSchema.extend({
  studentUserId: UuidSchema,
  attemptId: UuidSchema,
});
export type IntegritySummary = z.infer<typeof IntegritySummarySchema>;

export const IntegritySummaryListSchema = z.strictObject({ items: z.array(IntegritySummarySchema) });
export type IntegritySummaryList = z.infer<typeof IntegritySummaryListSchema>;

export const IntegrityEventViewSchema = z.strictObject({
  type: IntegrityEventTypeSchema,
  /** The question's position for a clipboard or typing event; null otherwise. */
  questionPosition: z.int().min(0).nullable(),
  recordedAt: IsoDateTimeSchema,
  /** The browser's time of a buffered event; null otherwise. */
  clientOccurredAt: IsoDateTimeSchema.nullable(),
  buffered: z.boolean(),
  /** EXAM only (018 research T6): the occurrence this event opened, null when it opened none. */
  occurrenceOrdinal: z.int().min(1).nullable(),
  /** `INACTIVITY` only: the idle time the browser reported. */
  idleSeconds: z.int().min(0).nullable(),
});
export type IntegrityEventView = z.infer<typeof IntegrityEventViewSchema>;

/** An exit and its return (or the next event / the submission when there is none: `open`). */
export const IntegrityIntervalSchema = z.strictObject({
  kind: IntegrityIntervalKindSchema,
  from: IsoDateTimeSchema,
  to: IsoDateTimeSchema,
  seconds: count,
  /** No return was recorded; the interval ends at the next event or the submission. */
  open: z.boolean(),
});
export type IntegrityInterval = z.infer<typeof IntegrityIntervalSchema>;

/** 023/FR-021: the teacher's timeline names the student of each fact (one for an individual attempt). */
export const TeacherIntegrityEventViewSchema = IntegrityEventViewSchema.extend({ studentUserId: UuidSchema });
export type TeacherIntegrityEventView = z.infer<typeof TeacherIntegrityEventViewSchema>;
export const TeacherIntegrityIntervalSchema = IntegrityIntervalSchema.extend({ studentUserId: UuidSchema });
export type TeacherIntegrityInterval = z.infer<typeof TeacherIntegrityIntervalSchema>;

/**
 * `GET /classes/:classId/activities/:activityId/attempts/:attemptId/integrity`, in time order. In a group
 * attempt the intervals are derived per student and the totals add theirs (023/FR-021).
 */
export const IntegrityTimelineSchema = z.strictObject({
  events: z.array(TeacherIntegrityEventViewSchema),
  intervals: z.array(TeacherIntegrityIntervalSchema),
  totals: IntegrityTotalsSchema,
  /** EXAM only (018): the attempt's holds, oldest first; empty for the others. */
  holds: z.array(TeacherExamHoldSchema),
});
export type IntegrityTimeline = z.infer<typeof IntegrityTimelineSchema>;

/** `GET /me/activities/:activityId/attempt/integrity`: the student's own events (015/FR-027). */
export const StudentIntegritySchema = z.strictObject({
  events: z.array(IntegrityEventViewSchema),
  totals: IntegrityTotalsSchema,
});
export type StudentIntegrity = z.infer<typeof StudentIntegritySchema>;
