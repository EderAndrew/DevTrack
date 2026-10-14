import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";
import { WorkDifficultySchema } from "../works/enums.js";
import { WorkQuestionTeacherViewSchema, workQuestionVariants } from "../works/works.js";

// The questions of an exam (018 contracts/http-api.md, research T2): the 011 question model plus a
// difficulty and 1–3 of the exam's topics per question. `value`, `origin`, `status`, `reviewedAt`
// and `teacherId` are the server's (strict objects → 400).

export const EXAM_MIN_QUESTIONS = 1;
export const EXAM_MAX_QUESTIONS = 20;
export const EXAM_QUESTION_TOPICS_MIN = 1;
export const EXAM_QUESTION_TOPICS_MAX = 3;

const distinct = (values: readonly string[]) => new Set(values).size === values.length;

/** A question's topics: 1–3 distinct items, each among the exam's topics (checked by the exam). */
export const ExamQuestionTopicIdsSchema = z
  .array(UuidSchema)
  .min(EXAM_QUESTION_TOPICS_MIN)
  .max(EXAM_QUESTION_TOPICS_MAX)
  .refine(distinct, "DUPLICATE_TOPIC");

const examQuestionFields = {
  /** Required on approval (`422 EXAM_RULES`), so a draft may leave it out. */
  difficulty: WorkDifficultySchema.nullish(),
  topicIds: ExamQuestionTopicIdsSchema,
};

/** One question of a new exam, discriminated by `type`. */
export const ExamQuestionInputSchema = workQuestionVariants(examQuestionFields);
export type ExamQuestionInput = z.infer<typeof ExamQuestionInputSchema>;

/** One question of an edit: `id` for an existing question of the exam, none for a new one. */
export const ExamQuestionEditSchema = workQuestionVariants({ ...examQuestionFields, id: UuidSchema.optional() });
export type ExamQuestionEdit = z.infer<typeof ExamQuestionEditSchema>;

/** One question as its owner sees it, with its answer key. */
export const ExamQuestionTeacherViewSchema = WorkQuestionTeacherViewSchema.omit({ topicItemIds: true }).extend({
  difficulty: WorkDifficultySchema.nullable(),
  topicIds: z.array(UuidSchema),
});
export type ExamQuestionTeacherView = z.infer<typeof ExamQuestionTeacherViewSchema>;
