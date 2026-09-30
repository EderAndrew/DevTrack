import { WorkDifficultySchema } from "@repo/contracts";
import { z } from "zod";

export const READ_WORK_GENERATION_REQUEST = "read-work-generation-request";
export const WORK_GENERATION_REQUEST = "WORK_GENERATION_REQUEST";

/** The ref the model uses for the topic at a 0-based `position` of the request (research W12). */
export const topicRef = (position: number) => `T${position + 1}`;

/**
 * What `read-work-generation-request` returns (011 contracts/work-generator.md, research W12): the
 * selected topics of the execution's own request, by ref, the revision's title, competency and
 * language, and the configuration — never the work's title, description or grade (FR-025), ids,
 * the subject's name, other syllabi, users, classes or students. `build` reads it back from the
 * tool results, so both sides parse the same strict schema.
 */
export const WorkGenerationRequestContentSchema = z.strictObject({
  /** The syllabus text, as the model sees it: data, never instructions (the untrusted block). */
  syllabus: z.strictObject({
    title: z.string().nullable(),
    competency: z.string().nullable(),
    language: z.string().nullable(),
  }),
  topics: z.array(z.strictObject({ ref: z.string(), itemText: z.string(), groupTitle: z.string().nullable() })),
  request: z.strictObject({
    difficulty: WorkDifficultySchema,
    total: z.int(),
    counts: z.strictObject({ OPEN_ANSWER: z.int(), MULTIPLE_CHOICE: z.int(), CODE: z.int() }),
    trickQuestions: z.int(),
    /** The syllabus' language name when the request has code; null otherwise. */
    language: z.string().nullable(),
  }),
});
export type WorkGenerationRequestContent = z.infer<typeof WorkGenerationRequestContentSchema>;
