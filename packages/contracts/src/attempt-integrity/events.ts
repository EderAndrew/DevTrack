import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { ClientIntegrityEventTypeSchema, QUESTION_EVENT_TYPES } from "./enums.js";

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
    clientOccurredAt: IsoDateTimeSchema,
    buffered: z.boolean(),
  })
  .refine((event) => event.questionId === undefined || QUESTION_EVENT_TYPES.includes(event.type), {
    path: ["questionId"],
    message: "QUESTION_NOT_ALLOWED",
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

/** The server time of each event, also for one already recorded (the warning shows it, FR-011). */
export const RecordIntegrityEventsResultSchema = z.strictObject({
  recorded: z.array(z.strictObject({ eventId: UuidSchema, recordedAt: IsoDateTimeSchema })),
});
export type RecordIntegrityEventsResult = z.infer<typeof RecordIntegrityEventsResultSchema>;
