import { UuidSchema, WorkDifficultySchema } from "@repo/contracts";
import { z } from "zod";

export const READ_EXAM_GENERATION_REQUEST = "read-exam-generation-request";
export const EXAM_GENERATION_REQUEST = "EXAM_GENERATION_REQUEST";

/**
 * What `read-exam-generation-request` returns (018 contracts/exam-generator.md, research T14): the
 * chosen topics of the execution's own request with their ids (the output cites them as `topicIds`),
 * the revision's title, competency and language, and the configuration — never the exam's title or
 * grade, the subject's name, other syllabi, users, classes or students. `build` reads it back from the
 * tool results, so both sides parse the same strict schema.
 */
export const ExamGenerationRequestContentSchema = z.strictObject({
  /** The syllabus text, as the model sees it: data, never instructions (the untrusted block). */
  syllabus: z.strictObject({
    title: z.string().nullable(),
    competency: z.string().nullable(),
  }),
  topics: z.array(z.strictObject({ id: UuidSchema, itemText: z.string(), groupTitle: z.string().nullable() })),
  request: z.strictObject({
    difficulty: WorkDifficultySchema,
    quantity: z.int(),
    counts: z.strictObject({ OPEN_ANSWER: z.int(), MULTIPLE_CHOICE: z.int(), CODE: z.int() }),
    /** At most this many multiple-choice questions may be trick questions. */
    trickCount: z.int(),
    /** The syllabus' language when the request has code; null otherwise. */
    language: z.strictObject({ id: UuidSchema, name: z.string() }).nullable(),
  }),
});
export type ExamGenerationRequestContent = z.infer<typeof ExamGenerationRequestContentSchema>;
