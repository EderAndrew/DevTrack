import { z } from "zod";
import { AiHelpAllowanceSchema, AI_HELP_ALLOWANCE } from "../activities/enums.js";
import { AiErrorCodeSchema } from "../ai/enums.js";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { WorkHelperOutcomeSchema, WorkHelpBlockReasonSchema, WorkHelpStatusSchema, WorkHelpUnavailableReasonSchema } from "./enums.js";

// Requests and views of the AI help (015 contracts/http-api.md, research F11, F13). No view carries
// the answer key, the execution id or the student's identity.

/** The student's question (015/FR-016). */
export const HELP_QUESTION_MAX = 500;
/** The orientation and the out-of-scope reply (contracts/work-helper.md). */
export const HELP_MESSAGE_MAX = 2_000;
/** The code example of an orientation. */
export const HELP_EXAMPLE_MAX = 1_500;

/** `POST /me/activities/:activityId/attempt/help`. */
export const RequestHelpSchema = z.strictObject({
  questionId: UuidSchema,
  question: z.string().trim().min(1).max(HELP_QUESTION_MAX),
  idempotencyKey: UuidSchema,
});
export type RequestHelp = z.infer<typeof RequestHelpSchema>;

const HelpExampleSchema = z.strictObject({ code: z.string().min(1).max(HELP_EXAMPLE_MAX) });

/** Text only when the student may read it: an orientation or an out-of-scope reply (FR-019, FR-022). */
const textMatchesStatus = (item: { status: string; message: string | null; example: unknown }) =>
  (item.message !== null) === (item.status === "DELIVERED" || item.status === "OUT_OF_SCOPE") &&
  (item.example === null || item.status === "DELIVERED");

export const StudentHelpItemSchema = z
  .strictObject({
    id: UuidSchema,
    questionId: UuidSchema,
    question: z.string(),
    status: WorkHelpStatusSchema,
    message: z.string().max(HELP_MESSAGE_MAX).nullable(),
    example: HelpExampleSchema.nullable(),
    requestedAt: IsoDateTimeSchema,
    resolvedAt: IsoDateTimeSchema.nullable(),
  })
  .refine(textMatchesStatus, "TEXT_STATUS_MISMATCH");
export type StudentHelpItem = z.infer<typeof StudentHelpItemSchema>;

/** `GET /me/activities/:activityId/attempt/help`: `used` counts DELIVERED only (FR-020). */
export const StudentHelpStateSchema = z.strictObject({
  allowance: AiHelpAllowanceSchema,
  used: z.int().min(0).max(AI_HELP_ALLOWANCE),
  pending: z.boolean(),
  items: z.array(StudentHelpItemSchema),
});
export type StudentHelpState = z.infer<typeof StudentHelpStateSchema>;

/** For the teacher: why a request was blocked or failed, besides what the student saw (FR-025). */
export const TeacherHelpItemSchema = z
  .strictObject({
    id: UuidSchema,
    questionPosition: z.int().min(0),
    question: z.string(),
    status: WorkHelpStatusSchema,
    message: z.string().max(HELP_MESSAGE_MAX).nullable(),
    example: HelpExampleSchema.nullable(),
    reasonCode: z.union([WorkHelpBlockReasonSchema, AiErrorCodeSchema]).nullable(),
    requestedAt: IsoDateTimeSchema,
    resolvedAt: IsoDateTimeSchema.nullable(),
  })
  .refine(textMatchesStatus, "TEXT_STATUS_MISMATCH");
export type TeacherHelpItem = z.infer<typeof TeacherHelpItemSchema>;

/** `GET /classes/:classId/activities/:activityId/attempts/:attemptId/help`. */
export const TeacherHelpStateSchema = z.strictObject({
  allowance: AiHelpAllowanceSchema,
  used: z.int().min(0).max(AI_HELP_ALLOWANCE),
  items: z.array(TeacherHelpItemSchema),
});
export type TeacherHelpState = z.infer<typeof TeacherHelpStateSchema>;

/** `GET /work-help/availability` (research F3). */
export const HelpAvailabilitySchema = z
  .strictObject({ available: z.boolean(), reason: WorkHelpUnavailableReasonSchema.nullable() })
  .refine((availability) => availability.available === (availability.reason === null), "REASON_MISMATCH");
export type HelpAvailability = z.infer<typeof HelpAvailabilitySchema>;

/**
 * The `work-helper` output (contracts/work-helper.md): an orientation, with an optional code
 * example, or a short out-of-scope reply without one. Validated again by the leak check (F10).
 */
export const WorkHelperOutputSchema = z
  .strictObject({
    outcome: WorkHelperOutcomeSchema,
    message: z.string().min(1).max(HELP_MESSAGE_MAX),
    example: HelpExampleSchema.nullable(),
  })
  .refine((output) => output.example === null || output.outcome === "GUIDANCE", { path: ["example"], message: "EXAMPLE_NOT_ALLOWED" });
export type WorkHelperOutput = z.infer<typeof WorkHelperOutputSchema>;
