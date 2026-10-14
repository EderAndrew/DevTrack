import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";

// "Encerrada por avisos" (018 research T8, T9, T19): the 4th occurrence opens a hold that only the
// teacher resolves, once. A rule's result, never a fraud label: the decision is the teacher's.

/** The warnings shown before the hold: the occurrence `EXAM_WARNINGS + 1` opens it. */
export const EXAM_WARNINGS = 3;

/** The teacher's one decision on a hold. */
export const ExamHoldResolutionSchema = z.enum(["CANCEL_CONFIRMED", "RETURNED", "NOT_CANCELLED"]);
export type ExamHoldResolution = z.infer<typeof ExamHoldResolutionSchema>;

/** A hold as the teacher sees it; `canReturn` is derived: open, `now < endsAt` and the activity ACTIVE. */
export const TeacherExamHoldSchema = z
  .strictObject({
    id: UuidSchema,
    attemptId: UuidSchema,
    occurrenceOrdinal: z.int().min(EXAM_WARNINGS + 1),
    openedAt: IsoDateTimeSchema,
    resolution: ExamHoldResolutionSchema.nullable(),
    resolvedAt: IsoDateTimeSchema.nullable(),
    canReturn: z.boolean(),
  })
  .refine((hold) => (hold.resolution === null) === (hold.resolvedAt === null), "RESOLUTION_MISMATCH")
  .refine((hold) => hold.resolution === null || !hold.canReturn, "RESOLVED_CANNOT_RETURN");
export type TeacherExamHold = z.infer<typeof TeacherExamHoldSchema>;
