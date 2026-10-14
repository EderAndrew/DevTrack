import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { GradeOutputSchema, GradeStringSchema, gradeToCents } from "../works/grade.js";
import {
  WORK_DESCRIPTION_MAX,
  WORK_TITLE_MAX,
  WorkQuestionStudentViewSchema,
  WorkSubjectRefSchema,
  WorkTopicViewSchema,
  WorkWarningSchema,
} from "../works/works.js";
import { ExamOriginSchema, ExamStatusSchema } from "./enums.js";
import { EXAM_MAX_QUESTIONS, EXAM_MIN_QUESTIONS, ExamQuestionEditSchema, ExamQuestionInputSchema, ExamQuestionTeacherViewSchema } from "./questions.js";

// Exams of the teacher's private Banco de Provas (018 contracts/http-api.md, research T2). Mirrors
// the 011 work contracts; the differences: 1–20 questions, topics required (1–20 of one confirmed
// revision), and each question's difficulty and 1–3 topics. Values are computed by the server.

export const EXAM_TOPICS_MIN = 1;
export const EXAM_TOPICS_MAX = 20;

const distinct = (values: readonly string[]) => new Set(values).size === values.length;

/** A manual exam is saved as a draft or already approved, at the teacher's choice. */
export const ManualExamStatusSchema = ExamStatusSchema.extract(["DRAFT", "APPROVED"]);
export type ManualExamStatus = z.infer<typeof ManualExamStatusSchema>;

/** The exam's `version` as the teacher last saw it: a stale one → 409. */
const ExamVersionNumberSchema = z.int().min(1);

const examHeader = {
  syllabusRevisionId: UuidSchema,
  title: z.string().trim().min(1).max(WORK_TITLE_MAX),
  description: z.string().trim().max(WORK_DESCRIPTION_MAX).nullish(),
  totalGrade: GradeStringSchema,
  /** 1–20 distinct items of the confirmed revision. */
  topicIds: z.array(UuidSchema).min(EXAM_TOPICS_MIN).max(EXAM_TOPICS_MAX).refine(distinct, "DUPLICATE_TOPIC"),
};

interface ExamShape {
  totalGrade: string;
  topicIds: string[];
  questions: { topicIds: string[] }[];
}

/** The rules across the header and the questions: ≥ 0,01 per question, question topics ⊆ exam topics. */
function refineExam(value: ExamShape, ctx: z.RefinementCtx) {
  if (gradeToCents(value.totalGrade) < value.questions.length) {
    ctx.addIssue({ code: "custom", path: ["totalGrade"], message: "BELOW_MINIMUM_PER_QUESTION" });
  }
  const examTopics = new Set(value.topicIds);
  value.questions.forEach((question, index) => {
    if (question.topicIds.some((id) => !examTopics.has(id))) {
      ctx.addIssue({ code: "custom", path: ["questions", index, "topicIds"], message: "TOPIC_NOT_IN_EXAM" });
    }
  });
}

/** `POST /exams`: a manual exam, all or nothing. */
export const CreateExamRequestSchema = z
  .strictObject({
    subjectId: UuidSchema,
    ...examHeader,
    saveAs: ManualExamStatusSchema,
    questions: z.array(ExamQuestionInputSchema).min(EXAM_MIN_QUESTIONS).max(EXAM_MAX_QUESTIONS),
  })
  .superRefine(refineExam);
export type CreateExamRequest = z.infer<typeof CreateExamRequestSchema>;

/** `PUT /exams/:id`: the whole exam again, with the version it was read at. The subject never changes. */
export const UpdateExamRequestSchema = z
  .strictObject({
    ...examHeader,
    questions: z.array(ExamQuestionEditSchema).min(EXAM_MIN_QUESTIONS).max(EXAM_MAX_QUESTIONS),
    version: ExamVersionNumberSchema,
  })
  .superRefine((value, ctx) => {
    refineExam(value, ctx);
    const ids = value.questions.flatMap((question) => (question.id ? [question.id] : []));
    if (!distinct(ids)) ctx.addIssue({ code: "custom", path: ["questions"], message: "DUPLICATE_QUESTION" });
  });
export type UpdateExamRequest = z.infer<typeof UpdateExamRequestSchema>;

/** `POST /exams/:id/approve`, `/archive` and `/restore`. */
export const ExamVersionSchema = z.strictObject({ version: ExamVersionNumberSchema });
export type ExamVersion = z.infer<typeof ExamVersionSchema>;

/** Everything about an exam, for its owner only (with the answer keys). */
export const TeacherExamSchema = z.strictObject({
  id: UuidSchema,
  subject: WorkSubjectRefSchema,
  syllabusRevisionId: UuidSchema,
  topics: z.array(WorkTopicViewSchema),
  title: z.string(),
  description: z.string().nullable(),
  totalGrade: GradeOutputSchema,
  questionCount: z.int().min(EXAM_MIN_QUESTIONS).max(EXAM_MAX_QUESTIONS),
  origin: ExamOriginSchema,
  status: ExamStatusSchema,
  /** The situation a restore returns to; set only while ARCHIVED. */
  archivedFromStatus: ExamStatusSchema.nullable(),
  version: z.int().min(1),
  humanReviewed: z.boolean(),
  humanEdited: z.boolean(),
  reviewedBy: z.strictObject({ name: z.string() }).nullable(),
  reviewedAt: IsoDateTimeSchema.nullable(),
  generationRequestId: UuidSchema.nullable(),
  warnings: z.array(WorkWarningSchema),
  /** In position order. */
  questions: z.array(ExamQuestionTeacherViewSchema),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TeacherExam = z.infer<typeof TeacherExamSchema>;

/**
 * `GET /exams/:id/student-preview` ("Ver como aluno"): built on the server by copying these fields
 * only. Never an answer key, explanation, rubric, private test case, difficulty or origin.
 */
export const ExamStudentPreviewSchema = z.strictObject({
  id: UuidSchema,
  title: z.string(),
  description: z.string().nullable(),
  totalGrade: GradeOutputSchema,
  questions: z.array(WorkQuestionStudentViewSchema),
});
export type ExamStudentPreview = z.infer<typeof ExamStudentPreviewSchema>;

/** An exam in the bank's list. */
export const ExamSummarySchema = z.strictObject({
  id: UuidSchema,
  subject: WorkSubjectRefSchema,
  title: z.string(),
  totalGrade: GradeOutputSchema,
  questionCount: z.int().min(EXAM_MIN_QUESTIONS).max(EXAM_MAX_QUESTIONS),
  origin: ExamOriginSchema,
  status: ExamStatusSchema,
  topics: z.array(z.strictObject({ syllabusItemId: UuidSchema, itemText: z.string() })),
  humanEdited: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ExamSummary = z.infer<typeof ExamSummarySchema>;

export const EXAM_PAGE_SIZE_MAX = 50;

/** `GET /exams` filters (query string). Without `status`: DRAFT and APPROVED. */
export const ExamListQuerySchema = z.strictObject({
  status: ExamStatusSchema.optional(),
  subjectId: UuidSchema.optional(),
  /** Searched in the title, ignoring accents and case. */
  q: z.string().max(200).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().pipe(z.int().min(1).max(EXAM_PAGE_SIZE_MAX)).optional(),
});
export type ExamListQuery = z.infer<typeof ExamListQuerySchema>;

/** Keyset page by `updatedAt desc, id`; `nextCursor` is opaque to the web. */
export const ExamPageSchema = z.strictObject({
  items: z.array(ExamSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ExamPage = z.infer<typeof ExamPageSchema>;
