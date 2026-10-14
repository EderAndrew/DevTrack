import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { ClientIntegrityEventTypeSchema, INACTIVITY_IDLE_SECONDS_MAX, INACTIVITY_IDLE_SECONDS_MIN, QUESTION_EVENT_TYPES } from "./enums.js";

/** Events per request (015 contracts/http-api.md). */
export const INTEGRITY_EVENTS_MAX = 50;

/**
 * One event from the browser (015 research F4). `eventId` makes a resend a no-op; the server keeps
 * `clientOccurredAt` only when `buffered` (sent from the offline buffer) and stamps its own time.
 * Durations are never sent: the server derives them.
 */
export const IntegrityEventInputSchema = z
  .strictObject({
    eventId: UuidSchema,
    type: ClientIntegrityEventTypeSchema,
    /** Only for a blocked clipboard gesture in a question's field. */
    questionId: UuidSchema.optional(),
    /** `INACTIVITY` only, and required with it (018 research T7). */
    idleSeconds: z.int().min(INACTIVITY_IDLE_SECONDS_MIN).max(INACTIVITY_IDLE_SECONDS_MAX).optional(),
    clientOccurredAt: IsoDateTimeSchema,
    buffered: z.boolean(),
  })
  .refine((event) => event.questionId === undefined || QUESTION_EVENT_TYPES.includes(event.type), {
    path: ["questionId"],
    message: "QUESTION_NOT_ALLOWED",
  })
  .refine((event) => (event.idleSeconds !== undefined) === (event.type === "INACTIVITY"), {
    path: ["idleSeconds"],
    message: "IDLE_SECONDS_ONLY_WITH_INACTIVITY",
  });
export type IntegrityEventInput = z.infer<typeof IntegrityEventInputSchema>;

export const RecordIntegrityEventsRequestSchema = z.strictObject({
  events: z
    .array(IntegrityEventInputSchema)
    .min(1)
    .max(INTEGRITY_EVENTS_MAX)
    .refine((events) => new Set(events.map((event) => event.eventId)).size === events.length, "DUPLICATE_EVENT"),
});
export type RecordIntegrityEventsRequest = z.infer<typeof RecordIntegrityEventsRequestSchema>;

/**
 * The server time of each event, also for one already recorded (the warning shows it, FR-011), and
 * for an EXAM the attempt's occurrences after the batch and whether a hold is open, so the warning
 * shows right away (018 research T6, T13); null for the others.
 */
export const RecordIntegrityEventsResultSchema = z.strictObject({
  recorded: z.array(z.strictObject({ eventId: UuidSchema, recordedAt: IsoDateTimeSchema })),
  exam: z.strictObject({ occurrenceCount: z.int().min(0), held: z.boolean() }).nullable(),
});
export type RecordIntegrityEventsResult = z.infer<typeof RecordIntegrityEventsResultSchema>;
