import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import {
  TestCaseVisibilitySchema,
  WorkDifficultySchema,
  WorkGradingStrategySchema,
  WorkOriginSchema,
  WorkQuestionTypeSchema,
  WorkStatusSchema,
} from "./enums.js";
import { GradeOutputSchema, GradeStringSchema, gradeToCents } from "./grade.js";

// Works of the teacher's private bank (011 contracts/http-api.md, research W6). Strict: unknown
// fields → 400, including `teacherId`, `origin`, `value`, `position`, `gradingStrategy`,
// `humanReviewed`, `reviewedById` or any model field. Positions come from the array order and
// values are computed (research W4). Nothing here comes from the 010 exercise contracts (W1).

/** Statement, expected answer and expected solution: 1–10 000 characters after trim. */
const LongTextSchema = z.string().trim().min(1).max(10_000);
/** Explanation, rubric, instructions and starter code: optional, up to 10 000 characters. */
const OptionalLongTextSchema = z.string().trim().max(10_000).nullish();
/** Test-case input and output may be empty. */
const TestCaseTextSchema = z.string().max(10_000);

export const WORK_QUESTIONS_MIN = 1;
export const WORK_QUESTIONS_MAX = 10;
export const WORK_ALTERNATIVES_MIN = 3;
export const WORK_ALTERNATIVES_MAX = 5;
export const WORK_TEST_CASES_MAX = 20;
export const WORK_TOPICS_MAX = 10;
export const WORK_QUESTION_TOPICS_MAX = 3;
export const WORK_TITLE_MAX = 200;
export const WORK_DESCRIPTION_MAX = 5000;

/**
 * The comparison key of an alternative's text: accents, case and the amount of whitespace
 * ignored. Two alternatives of one question never share it (011/FR-003).
 */
export function workAlternativeKey(text: string): string {
  const words = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/\s+/).filter(Boolean);
  return JSON.stringify(words);
}

export const WorkAlternativeInputSchema = z.strictObject({
  text: z.string().trim().min(1).max(2000),
  isCorrect: z.boolean(),
});
export type WorkAlternativeInput = z.infer<typeof WorkAlternativeInputSchema>;

/** Why a list of alternatives breaks 011/FR-003, or null. The count is checked by the array bounds. */
export function workAlternativesProblem(alternatives: readonly WorkAlternativeInput[]): "CORRECT_COUNT" | "DUPLICATE_TEXT" | null {
  if (alternatives.filter((alternative) => alternative.isCorrect).length !== 1) return "CORRECT_COUNT";
  const keys = alternatives.map((alternative) => workAlternativeKey(alternative.text));
  if (new Set(keys).size !== keys.length) return "DUPLICATE_TEXT";
  return null;
}

export const WorkTestCaseInputSchema = z.strictObject({
  input: TestCaseTextSchema,
  expectedOutput: TestCaseTextSchema,
  visibility: TestCaseVisibilitySchema,
});
export type WorkTestCaseInput = z.infer<typeof WorkTestCaseInputSchema>;

const distinct = (values: readonly string[]) => new Set(values).size === values.length;

/** A question's topics: 0–3 distinct items among the work's topics. */
const QuestionTopicIdsSchema = z
  .array(UuidSchema)
  .max(WORK_QUESTION_TOPICS_MAX)
  .refine(distinct, "DUPLICATE_TOPIC")
  .optional();

/**
 * The three variants of a question input, with `extra` fields added to each (`id` on edit). Built
 * per use because a refined object can't be extended.
 */
function questionVariants<Extra extends z.core.$ZodLooseShape>(extra: Extra) {
  const common = {
    statement: LongTextSchema,
    explanation: OptionalLongTextSchema,
    topicItemIds: QuestionTopicIdsSchema,
    ...extra,
  };
  const openAnswer = z.strictObject({
    type: z.literal("OPEN_ANSWER"),
    ...common,
    expectedAnswer: LongTextSchema,
    rubric: OptionalLongTextSchema,
  });
  const multipleChoice = z
    .strictObject({
      type: z.literal("MULTIPLE_CHOICE"),
      ...common,
      /** Presentation order; 3–5, exactly one correct, distinct texts (011/FR-003). */
      alternatives: z.array(WorkAlternativeInputSchema).min(WORK_ALTERNATIVES_MIN).max(WORK_ALTERNATIVES_MAX),
      isTrickQuestion: z.boolean().default(false),
    })
    .superRefine((value, ctx) => {
      // The generic `Extra` hides the shape from the checker; the object above has `alternatives`.
      const problem = workAlternativesProblem((value as { alternatives: WorkAlternativeInput[] }).alternatives);
      if (problem) ctx.addIssue({ code: "custom", path: ["alternatives"], message: problem });
    });
  const code = z.strictObject({
    type: z.literal("CODE"),
    ...common,
    instructions: OptionalLongTextSchema,
    starterCode: OptionalLongTextSchema,
    expectedSolution: LongTextSchema,
    /** An active entry of the catalog (checked on the server, 400); an inactive one already on the question stays valid. */
    languageId: UuidSchema,
    /** 0–20; none gives the approval warning `CODE_QUESTION_WITHOUT_TEST_CASES` (research W15). */
    testCases: z.array(WorkTestCaseInputSchema).max(WORK_TEST_CASES_MAX).default([]),
  });
  return z.discriminatedUnion("type", [openAnswer, multipleChoice, code]);
}

/** One question of a new work, discriminated by `type` (011/FR-003–FR-006). */
export const WorkQuestionInputSchema = questionVariants({});
export type WorkQuestionInput = z.infer<typeof WorkQuestionInputSchema>;

/** One question of an edit: `id` for an existing question of the work, none for a new one. */
export const WorkQuestionEditSchema = questionVariants({ id: UuidSchema.optional() });
export type WorkQuestionEdit = z.infer<typeof WorkQuestionEditSchema>;

/** The work's topics: 1–10 distinct items of one confirmed revision of its subject, or none. */
export const WorkTopicsInputSchema = z
  .strictObject({
    syllabusRevisionId: UuidSchema,
    syllabusItemIds: z.array(UuidSchema).min(1).max(WORK_TOPICS_MAX).refine(distinct, "DUPLICATE_TOPIC"),
  })
  .nullable();
export type WorkTopicsInput = z.infer<typeof WorkTopicsInputSchema>;

/** A manual work is saved as a draft or already approved, at the teacher's choice (011/FR-013). */
export const ManualWorkStatusSchema = WorkStatusSchema.extract(["DRAFT", "APPROVED"]);
export type ManualWorkStatus = z.infer<typeof ManualWorkStatusSchema>;

/** The work's `version` as the teacher last saw it (research W16): a stale one → 409. */
const WorkVersionSchema = z.int().min(1);

const workHeader = {
  title: z.string().trim().min(1).max(WORK_TITLE_MAX),
  description: z.string().trim().max(WORK_DESCRIPTION_MAX).nullish(),
  difficulty: WorkDifficultySchema.nullish(),
  totalGrade: GradeStringSchema,
  topics: WorkTopicsInputSchema,
};

interface WorkShape {
  totalGrade: string;
  topics: WorkTopicsInput;
  questions: { topicItemIds?: string[] | undefined }[];
}

/** The rules across the header and the questions: ≥ 0,01 per question, question topics ⊆ work topics. */
function refineWork(value: WorkShape, ctx: z.RefinementCtx) {
  if (gradeToCents(value.totalGrade) < value.questions.length) {
    ctx.addIssue({ code: "custom", path: ["totalGrade"], message: "BELOW_MINIMUM_PER_QUESTION" });
  }
  const workTopics = new Set(value.topics?.syllabusItemIds ?? []);
  value.questions.forEach((question, index) => {
    if ((question.topicItemIds ?? []).some((id) => !workTopics.has(id))) {
      ctx.addIssue({ code: "custom", path: ["questions", index, "topicItemIds"], message: "TOPIC_NOT_IN_WORK" });
    }
  });
}

/** `POST /works`: a manual work, all or nothing (011/FR-002, FR-010, FR-011). */
export const CreateWorkRequestSchema = z
  .strictObject({
    subjectId: UuidSchema,
    ...workHeader,
    questions: z.array(WorkQuestionInputSchema).min(WORK_QUESTIONS_MIN).max(WORK_QUESTIONS_MAX),
    status: ManualWorkStatusSchema,
  })
  .superRefine(refineWork);
export type CreateWorkRequest = z.infer<typeof CreateWorkRequestSchema>;

/**
 * `PUT /works/:id`: the whole work again (research W16), with the version it was read at. The
 * subject never changes; an existing question keeps its type (checked on the server).
 */
export const UpdateWorkRequestSchema = z
  .strictObject({
    ...workHeader,
    questions: z.array(WorkQuestionEditSchema).min(WORK_QUESTIONS_MIN).max(WORK_QUESTIONS_MAX),
    version: WorkVersionSchema,
  })
  .superRefine((value, ctx) => {
    refineWork(value, ctx);
    const ids = value.questions.flatMap((question) => (question.id ? [question.id] : []));
    if (!distinct(ids)) ctx.addIssue({ code: "custom", path: ["questions"], message: "DUPLICATE_QUESTION" });
  });
export type UpdateWorkRequest = z.infer<typeof UpdateWorkRequestSchema>;

/** `POST /works/:id/approve`, `/archive` and `/restore`. */
export const WorkVersionRequestSchema = z.strictObject({ version: WorkVersionSchema });
export type WorkVersionRequest = z.infer<typeof WorkVersionRequestSchema>;

export const WorkWarningSchema = z.strictObject({
  code: z.literal("CODE_QUESTION_WITHOUT_TEST_CASES"),
  /** 0-based positions of the questions it concerns. */
  positions: z.array(z.int().min(0)),
});
export type WorkWarning = z.infer<typeof WorkWarningSchema>;

export const WorkSubjectRefSchema = z.strictObject({ id: UuidSchema, name: z.string() });

export const WorkTopicViewSchema = z.strictObject({
  syllabusItemId: UuidSchema,
  itemText: z.string(),
  groupTitle: z.string().nullable(),
});
export type WorkTopicView = z.infer<typeof WorkTopicViewSchema>;

/** One question as its owner sees it; the fields of other types are absent. */
export const WorkQuestionTeacherViewSchema = z.strictObject({
  id: UuidSchema,
  position: z.int().min(0),
  type: WorkQuestionTypeSchema,
  gradingStrategy: WorkGradingStrategySchema,
  value: GradeOutputSchema,
  statement: z.string(),
  explanation: z.string().nullable(),
  topicItemIds: z.array(UuidSchema),
  /** OPEN_ANSWER. */
  expectedAnswer: z.string().optional(),
  rubric: z.string().nullable().optional(),
  /** MULTIPLE_CHOICE: presentation order. */
  alternatives: z.array(z.strictObject({ id: UuidSchema, position: z.int().min(0), text: z.string(), isCorrect: z.boolean() })).optional(),
  isTrickQuestion: z.boolean(),
  /** CODE. */
  instructions: z.string().nullable().optional(),
  starterCode: z.string().nullable().optional(),
  expectedSolution: z.string().optional(),
  language: z.strictObject({ id: UuidSchema, name: z.string() }).optional(),
  testCases: z
    .array(
      z.strictObject({
        id: UuidSchema,
        position: z.int().min(0),
        input: z.string(),
        expectedOutput: z.string(),
        visibility: TestCaseVisibilitySchema,
      }),
    )
    .optional(),
});
export type WorkQuestionTeacherView = z.infer<typeof WorkQuestionTeacherViewSchema>;

/** Everything about a work, for its owner only (research W14). */
export const WorkTeacherViewSchema = z.strictObject({
  id: UuidSchema,
  subject: WorkSubjectRefSchema,
  syllabusRevisionId: UuidSchema.nullable(),
  topics: z.array(WorkTopicViewSchema),
  title: z.string(),
  description: z.string().nullable(),
  difficulty: WorkDifficultySchema.nullable(),
  totalGrade: GradeOutputSchema,
  questionCount: z.int().min(1),
  origin: WorkOriginSchema,
  status: WorkStatusSchema,
  /** The situation a restore returns to; set only while ARCHIVED. */
  archivedFromStatus: WorkStatusSchema.nullable(),
  /** Optimistic concurrency: every change sends it back (research W16). */
  version: z.int().min(1),
  humanReviewed: z.boolean(),
  humanEdited: z.boolean(),
  reviewedBy: z.strictObject({ name: z.string() }).nullable(),
  reviewedAt: IsoDateTimeSchema.nullable(),
  generationRequestId: UuidSchema.nullable(),
  warnings: z.array(WorkWarningSchema),
  /** In position order. */
  questions: z.array(WorkQuestionTeacherViewSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type WorkTeacherView = z.infer<typeof WorkTeacherViewSchema>;

/** One question as a student may see it: a closed list (research W14, 011/FR-033). */
export const WorkQuestionStudentViewSchema = z.strictObject({
  id: UuidSchema,
  position: z.int().min(0),
  type: WorkQuestionTypeSchema,
  value: GradeOutputSchema,
  statement: z.string(),
  instructions: z.string().optional(),
  starterCode: z.string().optional(),
  language: z.strictObject({ name: z.string() }).optional(),
  /** PUBLIC test cases only. */
  publicTestCases: z.array(z.strictObject({ input: z.string(), expectedOutput: z.string() })).optional(),
  /** Presentation order; never which one is correct. */
  alternatives: z.array(z.strictObject({ id: UuidSchema, text: z.string() })).optional(),
});
export type WorkQuestionStudentView = z.infer<typeof WorkQuestionStudentViewSchema>;

/**
 * What a student may see of a work, built on the server by copying these fields only. Never an
 * answer key, explanation, rubric, private test case, grading strategy, review or origin.
 */
export const WorkStudentViewSchema = z.strictObject({
  id: UuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  totalGrade: GradeOutputSchema,
  questions: z.array(WorkQuestionStudentViewSchema),
});
export type WorkStudentView = z.infer<typeof WorkStudentViewSchema>;

/** A work in the bank's list. */
export const WorkSummarySchema = z.strictObject({
  id: UuidSchema,
  subject: WorkSubjectRefSchema,
  title: z.string(),
  difficulty: WorkDifficultySchema.nullable(),
  totalGrade: GradeOutputSchema,
  questionCount: z.int().min(1),
  origin: WorkOriginSchema,
  status: WorkStatusSchema,
  topics: z.array(z.strictObject({ syllabusItemId: UuidSchema, itemText: z.string() })),
  humanEdited: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type WorkSummary = z.infer<typeof WorkSummarySchema>;

export const WORK_PAGE_SIZE_MAX = 50;

/** `GET /works` filters (query string). Without `status`: DRAFT and APPROVED (research W19). */
export const WorkListQuerySchema = z.strictObject({
  subjectId: UuidSchema.optional(),
  syllabusRevisionId: UuidSchema.optional(),
  syllabusItemId: UuidSchema.optional(),
  origin: WorkOriginSchema.optional(),
  status: WorkStatusSchema.optional(),
  difficulty: WorkDifficultySchema.optional(),
  /** Creation period, inclusive dates. */
  createdFrom: IsoDateSchema.optional(),
  createdTo: IsoDateSchema.optional(),
  /** Searched in the title, ignoring accents and case. */
  query: z.string().max(200).optional(),
  cursor: z.string().max(200).optional(),
  pageSize: z.coerce.number().pipe(z.int().min(1).max(WORK_PAGE_SIZE_MAX)).optional(),
});
export type WorkListQuery = z.infer<typeof WorkListQuerySchema>;

/** Keyset page by `updatedAt desc, id`; `nextCursor` is opaque to the web. */
export const WorkPageSchema = z.strictObject({
  items: z.array(WorkSummarySchema),
  nextCursor: z.string().nullable(),
});
export type WorkPage = z.infer<typeof WorkPageSchema>;
