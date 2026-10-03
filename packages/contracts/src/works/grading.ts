import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";
import { WorkGradingStrategySchema } from "./enums.js";
import { GRADE_MAX_CENTS } from "./grade.js";

// The grading of a work's questions and the student's grade (011 contracts/grading.md, research
// W7). Domain shapes the 012 grading uses; no route serves them in 011 (FR-042). Grades are
// integer hundredths (research W3).

/** A student's answer to one question. `alternativeId: null` is a blank multiple choice. */
export const AnswerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ALTERNATIVE"), alternativeId: UuidSchema.nullable() }),
  /** Data, never run by the API: only the Code Runner (a spec of its own) executes it. */
  z.strictObject({ kind: z.literal("CODE"), source: z.string().max(100_000) }),
  z.strictObject({ kind: z.literal("TEXT"), text: z.string().max(20_000) }),
]);
export type Answer = z.infer<typeof AnswerSchema>;

/** Where a question's grade comes from: a rule, a machine's suggestion or a person (011/FR-039). */
export const GradingNatureSchema = z.enum(["RULE_RESULT", "SUGGESTION", "HUMAN_DECISION"]);
export type GradingNature = z.infer<typeof GradingNatureSchema>;

export const QuestionGradingStatusSchema = z.enum(["GRADED", "SUGGESTED", "PENDING_TEACHER", "DECIDED"]);
export type QuestionGradingStatus = z.infer<typeof QuestionGradingStatusSchema>;

/** Why the teacher has to grade it: a technical failure never becomes a 0 (011/FR-040). */
export const PendingReasonSchema = z.enum([
  "CODE_RUNNER_UNAVAILABLE",
  "CODE_RUNNER_INFRA_ERROR",
  "NO_TEST_CASES",
  "AI_REVIEW_FAILED",
  "AI_REVIEW_OUT_OF_RANGE",
  /** No reviewer exists yet (012 has no AI): the teacher grades, as with no Code Runner. */
  "AI_REVIEW_UNAVAILABLE",
]);
export type PendingReason = z.infer<typeof PendingReasonSchema>;

const CentsSchema = z.int().min(0).max(GRADE_MAX_CENTS);

/**
 * One question graded. A final grade exists only for a rule result or a teacher's decision; a
 * suggestion never is one (011/SC-011); every grade lies in 0…`valueCents`.
 */
export const QuestionGradingSchema = z
  .strictObject({
    questionId: UuidSchema,
    strategy: WorkGradingStrategySchema,
    valueCents: CentsSchema.min(1),
    status: QuestionGradingStatusSchema,
    nature: GradingNatureSchema.nullable(),
    suggestedCents: CentsSchema.nullable(),
    teacherCents: CentsSchema.nullable(),
    finalCents: CentsSchema.nullable(),
    pendingReason: PendingReasonSchema.nullable(),
  })
  .superRefine((grading, ctx) => {
    for (const field of ["suggestedCents", "teacherCents", "finalCents"] as const) {
      const cents = grading[field];
      if (cents !== null && cents > grading.valueCents) ctx.addIssue({ code: "custom", path: [field], message: "GRADE_OUT_OF_RANGE" });
    }
    const final = grading.status === "GRADED" || grading.status === "DECIDED";
    if (final !== (grading.finalCents !== null)) ctx.addIssue({ code: "custom", path: ["finalCents"], message: "FINAL_GRADE_MISMATCH" });
    if ((grading.status === "PENDING_TEACHER") !== (grading.pendingReason !== null)) {
      ctx.addIssue({ code: "custom", path: ["pendingReason"], message: "PENDING_REASON_MISMATCH" });
    }
  });
export type QuestionGrading = z.infer<typeof QuestionGradingSchema>;

/** The student's grade in a work: partial while a question has no final grade (011/FR-041). */
export const WorkGradeSchema = z.strictObject({ cents: CentsSchema, partial: z.boolean() });
export type WorkGrade = z.infer<typeof WorkGradeSchema>;
