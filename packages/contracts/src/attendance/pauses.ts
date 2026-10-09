import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { PauseEndKindSchema, PauseInitiatorSchema, PauseReasonSchema, StudentPauseReasonSchema } from "./enums.js";

// Room exits of a work attempt (016 contracts/http-api.md, research M6, M7). A pause is a fact for
// the teacher, never a grade or a block of the deadline (FR-018); its end and duration are derived.

/** The student's optional text with "Outro" (FR-011). */
export const PAUSE_NOTE_MAX = 200;

const reasonMatchesInitiator = (pause: { initiatedBy: string; reason: string }) =>
  (pause.initiatedBy === "TEACHER") === (pause.reason === "TEACHER");
const noteOnlyWithOther = (pause: { reason: string; note?: string | null }) => pause.note == null || pause.reason === "OTHER";

/** `POST /me/activities/:activityId/attempt/pause`. */
export const DeclareExitSchema = z
  .strictObject({
    reason: StudentPauseReasonSchema,
    note: z.string().trim().min(1).max(PAUSE_NOTE_MAX).optional(),
  })
  .refine(noteOnlyWithOther, { path: ["note"], message: "NOTE_ONLY_WITH_OTHER" });
export type DeclareExit = z.infer<typeof DeclareExitSchema>;

/** A pause as the teacher sees it; `seconds` runs up to the server's now while open. */
export const TeacherPauseSchema = z
  .strictObject({
    id: UuidSchema,
    initiatedBy: PauseInitiatorSchema,
    reason: PauseReasonSchema,
    note: z.string().max(PAUSE_NOTE_MAX).nullable(),
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.nullable(),
    endedBy: PauseEndKindSchema.nullable(),
    seconds: z.int().min(0),
  })
  .refine(reasonMatchesInitiator, "REASON_INITIATOR_MISMATCH")
  .refine(noteOnlyWithOther, "NOTE_ONLY_WITH_OTHER")
  .refine((pause) => (pause.endedAt === null) === (pause.endedBy === null), "END_MISMATCH");
export type TeacherPause = z.infer<typeof TeacherPauseSchema>;

/** A pause as the student sees it: their own note, never who released it. */
export const StudentPauseSchema = z
  .strictObject({
    id: UuidSchema,
    initiatedBy: PauseInitiatorSchema,
    reason: PauseReasonSchema,
    note: z.string().max(PAUSE_NOTE_MAX).nullable(),
    startedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.nullable(),
  })
  .refine(reasonMatchesInitiator, "REASON_INITIATOR_MISMATCH")
  .refine(noteOnlyWithOther, "NOTE_ONLY_WITH_OTHER");
export type StudentPause = z.infer<typeof StudentPauseSchema>;

/** `GET /me/activities/:activityId/attempt/pause`, polled on the answering page (research M8). */
export const MyPauseSchema = z.strictObject({ pause: StudentPauseSchema.nullable() });
export type MyPause = z.infer<typeof MyPauseSchema>;

/** `GET /classes/:classId/activities/:activityId/attempts/:attemptId/pauses` (FR-021). */
export const AttemptPausesSchema = z.strictObject({
  items: z.array(TeacherPauseSchema),
  totalSecondsAway: z.int().min(0),
});
export type AttemptPauses = z.infer<typeof AttemptPausesSchema>;
