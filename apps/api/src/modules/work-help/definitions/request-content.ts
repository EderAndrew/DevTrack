import { WorkQuestionTypeSchema } from "@repo/contracts";
import { z } from "zod";

export const READ_WORK_HELP_REQUEST = "read-work-help-request";
export const WORK_HELP_REQUEST = "WORK_HELP_REQUEST";

/** Alternatives reach the model by letter, in the order the student sees them (contracts/work-helper.md). */
export const ALTERNATIVE_LABELS = ["A", "B", "C", "D", "E"] as const;
const AlternativeLabelSchema = z.enum(ALTERNATIVE_LABELS);

/**
 * What `read-work-help-request` returns (015 contracts/work-helper.md, research F8): the fields of
 * the student's view of the one question the request is about, the student's saved answer and
 * question, and the orientations already delivered for that question in the attempt. Never the
 * correct alternative, expected answer, expected solution, explanation, rubric, private test cases,
 * value, trick flag, names, e-mails or ids. All of it is untrusted content for the model.
 */
export const WorkHelpRequestContentSchema = z.strictObject({
  questionType: WorkQuestionTypeSchema,
  statement: z.string(),
  instructions: z.string().nullable(),
  starterCode: z.string().nullable(),
  language: z.string().nullable(),
  alternatives: z.array(z.strictObject({ label: AlternativeLabelSchema, text: z.string() })).nullable(),
  publicTestCases: z.array(z.strictObject({ input: z.string(), expectedOutput: z.string() })).nullable(),
  studentAnswer: z.union([z.string(), z.strictObject({ label: AlternativeLabelSchema })]).nullable(),
  studentQuestion: z.string(),
  previousGuidance: z.array(z.string()),
});
export type WorkHelpRequestContent = z.infer<typeof WorkHelpRequestContentSchema>;
