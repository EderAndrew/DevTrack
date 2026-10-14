import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";
import { WorkDifficultySchema } from "../works/enums.js";
import { GradeOutputSchema } from "../works/grade.js";

// What an approved exam covers before it is applied (018 research T15, constitution XXIII): its
// questions and points per topic, flagged when the topic is outside the class's taught scope, and
// per difficulty. Computed by the pure `exams/coverage.ts` of the API; `points` is the grade sum.

const count = z.int().min(0);

export const ExamCoverageSchema = z.strictObject({
  byTopic: z.array(
    z.strictObject({
      syllabusItemId: UuidSchema,
      title: z.string(),
      questions: count,
      points: GradeOutputSchema,
      outOfScope: z.boolean(),
    }),
  ),
  byDifficulty: z.array(z.strictObject({ difficulty: WorkDifficultySchema, questions: count, points: GradeOutputSchema })),
});
export type ExamCoverage = z.infer<typeof ExamCoverageSchema>;
