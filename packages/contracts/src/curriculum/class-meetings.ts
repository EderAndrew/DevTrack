import { z } from "zod";
import { IsoDateSchema, UuidSchema } from "../common/primitives.js";
import {
  MAX_ABSENCE_NOTICE_LENGTH,
  MAX_ABSENCE_REASON_LENGTH,
  MAX_CALENDAR_SET_ENTRIES,
  MAX_DAY_DESCRIPTION_LENGTH,
  MAX_MEETINGS_PER_CLASS,
  MAX_TOPICS_PER_PLAN,
} from "./limits.js";

// Class calendar (004 contracts/http-api.md, "Calendário").

/** Only `PLANNED` is used in 004. */
export const ClassMeetingStatusSchema = z.enum(["PLANNED", "COMPLETED", "CANCELLED"]);
export type ClassMeetingStatus = z.infer<typeof ClassMeetingStatusSchema>;

/** Optimistic concurrency counter of a class plan (research E13). */
export const PlanRevisionSchema = z.int().min(1);
export type PlanRevision = z.infer<typeof PlanRevisionSchema>;

// 031 — the kind of each marked day (contracts/http-api.md "Shared", research CK1).

/** The kinds that are encontros: numbered, take topics. */
export const MeetingKindSchema = z.enum(["CLASS", "EXAM", "ASSIGNMENT", "REVIEW", "MAKEUP"]);
export type MeetingKind = z.infer<typeof MeetingKindSchema>;

/** The kinds that are not encontros. */
export const CalendarDayKindSchema = z.enum(["HOLIDAY", "RECESS", "SPECIAL_EVENT", "TEACHER_ABSENCE"]);
export type CalendarDayKind = z.infer<typeof CalendarDayKindSchema>;

/** The nine kinds of a marked day. */
export const DayKindSchema = z.enum([...MeetingKindSchema.options, ...CalendarDayKindSchema.options]);
export type DayKind = z.infer<typeof DayKindSchema>;

const codePoints = (value: string) => [...value].length;

/** Trimmed text of `min`–`max` code points, no NUL (CK4; PostgreSQL refuses NUL in `text`). */
const trimmedText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((value) => codePoints(value) >= min && codePoints(value) <= max)
    .refine((value) => !value.includes("\u0000"));

export const DescriptionSchema = trimmedText(1, MAX_DAY_DESCRIPTION_LENGTH);
export const AbsenceReasonSchema = trimmedText(1, MAX_ABSENCE_REASON_LENGTH);
/** Optional: empty (or only spaces) and absent become `null`. */
export const AbsenceNoticeSchema = z
  .union([trimmedText(0, MAX_ABSENCE_NOTICE_LENGTH), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

const describedDay = (kind: "EXAM" | "ASSIGNMENT" | "REVIEW" | "MAKEUP" | "HOLIDAY" | "RECESS" | "SPECIAL_EVENT") =>
  z.strictObject({ date: IsoDateSchema, kind: z.literal(kind), description: DescriptionSchema });

/** One typed date of `set`: CLASS only the date; seven kinds a description; TEACHER_ABSENCE a reason and a notice. */
export const CalendarDayInputSchema = z.discriminatedUnion("kind", [
  z.strictObject({ date: IsoDateSchema, kind: z.literal("CLASS") }),
  describedDay("EXAM"),
  describedDay("ASSIGNMENT"),
  describedDay("REVIEW"),
  describedDay("MAKEUP"),
  describedDay("HOLIDAY"),
  describedDay("RECESS"),
  describedDay("SPECIAL_EVENT"),
  z.strictObject({
    date: IsoDateSchema,
    kind: z.literal("TEACHER_ABSENCE"),
    absenceReason: AbsenceReasonSchema,
    absenceNotice: AbsenceNoticeSchema,
  }),
]);
export type CalendarDayInput = z.infer<typeof CalendarDayInputSchema>;

/** `number` is derived from the date order (research E12), never stored. 031: `description` is null on CLASS. */
export const ClassMeetingViewSchema = z.strictObject({
  id: UuidSchema,
  date: IsoDateSchema,
  number: z.int(),
  status: ClassMeetingStatusSchema,
  topicCount: z.int(),
  kind: MeetingKindSchema,
  description: z.string().nullable(),
});
export type ClassMeetingView = z.infer<typeof ClassMeetingViewSchema>;

/** 031: a day without class, as the teacher sees it (the reason is shown only here). */
export const CalendarDayViewSchema = z.strictObject({
  date: IsoDateSchema,
  kind: CalendarDayKindSchema,
  description: z.string().nullable(),
  absenceReason: z.string().nullable(),
  absenceNotice: z.string().nullable(),
});
export type CalendarDayView = z.infer<typeof CalendarDayViewSchema>;

/** `planRevision` is null while the class has no plan. `items`/`total` are meetings only; 031 `days` by date. */
export const ClassMeetingListSchema = z.strictObject({
  items: z.array(ClassMeetingViewSchema),
  days: z.array(CalendarDayViewSchema),
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

/**
 * Adding an existing date or removing a missing one has no effect; resolutions run before removals.
 * 031: `set` gives a kind (and its texts) to each date, default `[]` so a 004 body stays valid; a date in more than one
 * of `add`/`set`/`remove` is refused by the API (400).
 */
export const UpdateClassMeetingsRequestSchema = z.strictObject({
  planRevision: PlanRevisionSchema.nullable(),
  add: z.array(IsoDateSchema).max(MAX_MEETINGS_PER_CLASS),
  set: z.array(CalendarDayInputSchema).max(MAX_CALENDAR_SET_ENTRIES).default([]),
  remove: z.array(IsoDateSchema).max(MAX_MEETINGS_PER_CLASS),
  resolutions: z.array(TopicResolutionSchema).max(MAX_TOPICS_PER_PLAN),
});
export type UpdateClassMeetingsRequest = z.infer<typeof UpdateClassMeetingsRequestSchema>;
/** The body as a client sends it (031: `set` may be left out, as in 004). */
export type UpdateClassMeetingsBody = z.input<typeof UpdateClassMeetingsRequestSchema>;
