import { z } from "zod";
import { IsoDateSchema, UuidSchema } from "../common/primitives.js";
import { MAX_MEETINGS_PER_CLASS, MAX_TOPICS_PER_PLAN } from "./limits.js";

// Class calendar (004 contracts/http-api.md, "Calendário").

/** Only `PLANNED` is used in 004. */
export const ClassMeetingStatusSchema = z.enum(["PLANNED", "COMPLETED", "CANCELLED"]);
export type ClassMeetingStatus = z.infer<typeof ClassMeetingStatusSchema>;

/** Optimistic concurrency counter of a class plan (research E13). */
export const PlanRevisionSchema = z.int().min(1);
export type PlanRevision = z.infer<typeof PlanRevisionSchema>;

/** `number` is derived from the date order (research E12), never stored. */
export const ClassMeetingViewSchema = z.strictObject({
  id: UuidSchema,
  date: IsoDateSchema,
  number: z.int(),
  status: ClassMeetingStatusSchema,
  topicCount: z.int(),
});
export type ClassMeetingView = z.infer<typeof ClassMeetingViewSchema>;

/** `planRevision` is null while the class has no plan. */
export const ClassMeetingListSchema = z.strictObject({
  items: z.array(ClassMeetingViewSchema),
  total: z.int(),
  planRevision: PlanRevisionSchema.nullable(),
});
export type ClassMeetingList = z.infer<typeof ClassMeetingListSchema>;

/** What to do with a topic of a meeting being removed (004/FR-029). */
export const TopicResolutionSchema = z.discriminatedUnion("action", [
  z.strictObject({ topicId: UuidSchema, action: z.literal("MOVE"), meetingDate: IsoDateSchema }),
  z.strictObject({ topicId: UuidSchema, action: z.literal("UNSCHEDULE") }),
  z.strictObject({ topicId: UuidSchema, action: z.literal("MERGE"), intoTopicId: UuidSchema }),
  z.strictObject({ topicId: UuidSchema, action: z.literal("ARCHIVE") }),
]);
export type TopicResolution = z.infer<typeof TopicResolutionSchema>;

/** Adding an existing date or removing a missing one has no effect; resolutions run before removals. */
export const UpdateClassMeetingsRequestSchema = z.strictObject({
  planRevision: PlanRevisionSchema.nullable(),
  add: z.array(IsoDateSchema).max(MAX_MEETINGS_PER_CLASS),
  remove: z.array(IsoDateSchema).max(MAX_MEETINGS_PER_CLASS),
  resolutions: z.array(TopicResolutionSchema).max(MAX_TOPICS_PER_PLAN),
});
export type UpdateClassMeetingsRequest = z.infer<typeof UpdateClassMeetingsRequestSchema>;
