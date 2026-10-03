import { z } from "zod";
import { EnrollmentStatusSchema } from "../classes/enrollments.js";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { TestCaseVisibilitySchema, WorkGradingStrategySchema, WorkQuestionTypeSchema } from "../works/enums.js";
import { GRADE_MAX_CENTS, GradeOutputSchema, GradeStringSchema, gradeToCents } from "../works/grade.js";
import { AnswerSchema, GradingNatureSchema, PendingReasonSchema } from "../works/grading.js";
import {
  ActivityGradingStatusSchema,
  ActivityStatusSchema,
  ActivityTypeSchema,
  AttemptStatusSchema,
  ExecutionModeSchema,
  LatePolicySchema,
  PublicationPhaseSchema,
  RosterStatusSchema,
} from "./enums.js";

// The teacher's side of class activities (012 contracts/http-api.md, "Teacher routes"). Grades use
// the 011 arithmetic: integer hundredths in code, "0.50" strings on the wire (011 research W3).

export const ACTIVITY_EXERCISES_MIN = 1;
export const ACTIVITY_EXERCISES_MAX = 10;
export const ACTIVITY_TITLE_MAX = 200;
export const ACTIVITY_INSTRUCTIONS_MAX = 10_000;
export const ACTIVITY_FEEDBACK_MAX = 5_000;

/** The bank items to apply (research P2): one work, or 1–10 distinct exercises in the chosen order. */
export const ActivitySourceSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("ASSIGNMENT"), workId: UuidSchema }),
  z.strictObject({
    type: z.literal("EXERCISE"),
    exerciseIds: z
      .array(UuidSchema)
      .min(ACTIVITY_EXERCISES_MIN)
      .max(ACTIVITY_EXERCISES_MAX)
      .refine((ids) => new Set(ids).size === ids.length, "DUPLICATE_EXERCISE"),
  }),
]);
export type ActivitySource = z.infer<typeof ActivitySourceSchema>;

/** Topics of the source outside the class's taught scope (FR-005a, research P5). */
export const ScopeCheckSchema = z.strictObject({
  hasPlan: z.boolean(),
  outOfScope: z.array(
    z.strictObject({ syllabusItemId: UuidSchema, title: z.string(), questionPositions: z.array(z.int().min(0)) }),
  ),
});
export type ScopeCheck = z.infer<typeof ScopeCheckSchema>;

const TitleSchema = z.string().trim().min(1).max(ACTIVITY_TITLE_MAX);
const InstructionsSchema = z.string().max(ACTIVITY_INSTRUCTIONS_MAX);

/** FR-005: the deadline comes after the publication (a null publication is "now", checked on the server). */
const deadlineAfterPublication = (body: { publishAt?: string | null; deadline?: string }) =>
  !body.publishAt || !body.deadline || Date.parse(body.deadline) > Date.parse(body.publishAt);

export const CreateActivityRequestSchema = z
  .strictObject({
    idempotencyKey: UuidSchema,
    source: ActivitySourceSchema,
    title: TitleSchema,
    instructions: InstructionsSchema.nullish(),
    /** Required for EXERCISE (Q3 = A); an ASSIGNMENT keeps its work's grade. */
    totalGrade: GradeStringSchema.optional(),
    /** Null: now, by the server clock. */
    publishAt: IsoDateTimeSchema.nullable(),
    deadline: IsoDateTimeSchema,
    latePolicy: LatePolicySchema,
    acknowledgeOutOfScope: z.boolean(),
  })
  .superRefine((body, ctx) => {
    if (body.source.type === "EXERCISE" && body.totalGrade === undefined) {
      ctx.addIssue({ code: "custom", path: ["totalGrade"], message: "TOTAL_GRADE_REQUIRED" });
    }
    if (body.source.type === "ASSIGNMENT" && body.totalGrade !== undefined) {
      ctx.addIssue({ code: "custom", path: ["totalGrade"], message: "TOTAL_GRADE_FROM_WORK" });
    }
    if (body.source.type === "EXERCISE" && body.totalGrade !== undefined && gradeToCents(body.totalGrade) < body.source.exerciseIds.length) {
      ctx.addIssue({ code: "custom", path: ["totalGrade"], message: "GRADE_TOO_LOW_FOR_QUESTIONS" });
    }
    if (!deadlineAfterPublication(body)) ctx.addIssue({ code: "custom", path: ["deadline"], message: "INVALID_SCHEDULE" });
  });
export type CreateActivityRequest = z.infer<typeof CreateActivityRequestSchema>;

export const UpdateActivityRequestSchema = z
  .strictObject({
    version: z.int().min(1),
    title: TitleSchema.optional(),
    instructions: InstructionsSchema.nullable().optional(),
    /** Only while scheduled (`422 ALREADY_PUBLISHED`). */
    publishAt: IsoDateTimeSchema.optional(),
    deadline: IsoDateTimeSchema.optional(),
    latePolicy: LatePolicySchema.optional(),
  })
  .refine(deadlineAfterPublication, { path: ["deadline"], message: "INVALID_SCHEDULE" });
export type UpdateActivityRequest = z.infer<typeof UpdateActivityRequestSchema>;

export const RosterCountsSchema = z.strictObject({
  enrolled: z.int().min(0),
  inProgress: z.int().min(0),
  submitted: z.int().min(0),
  submittedLate: z.int().min(0),
  missed: z.int().min(0),
  pendingGrading: z.int().min(0),
});
export type RosterCounts = z.infer<typeof RosterCountsSchema>;

export const TeacherActivitySummarySchema = z.strictObject({
  id: UuidSchema,
  type: ActivityTypeSchema,
  executionMode: ExecutionModeSchema,
  title: z.string(),
  status: ActivityStatusSchema,
  /** Only for an ACTIVE activity. */
  phase: PublicationPhaseSchema.nullable(),
  publishAt: IsoDateTimeSchema,
  deadline: IsoDateTimeSchema,
  latePolicy: LatePolicySchema,
  totalGrade: GradeOutputSchema,
  resultReleasedAt: IsoDateTimeSchema.nullable(),
  counts: RosterCountsSchema,
});
export type TeacherActivitySummary = z.infer<typeof TeacherActivitySummarySchema>;

/** `GET /classes/:classId/activities`: every status, by deadline (latest first). */
export const TeacherActivityListSchema = z.strictObject({ items: z.array(TeacherActivitySummarySchema) });
export type TeacherActivityList = z.infer<typeof TeacherActivityListSchema>;

/** The full snapshot question, with its answer key: teacher routes only. */
export const TeacherQuestionSchema = z.strictObject({
  id: UuidSchema,
  position: z.int().min(0),
  type: WorkQuestionTypeSchema,
  gradingStrategy: WorkGradingStrategySchema,
  value: GradeOutputSchema,
  statement: z.string(),
  instructions: z.string().nullable(),
  starterCode: z.string().nullable(),
  language: z.strictObject({ id: UuidSchema, name: z.string() }).nullable(),
  expectedAnswer: z.string().nullable(),
  rubric: z.string().nullable(),
  expectedSolution: z.string().nullable(),
  explanation: z.string().nullable(),
  isTrickQuestion: z.boolean(),
  alternatives: z.array(z.strictObject({ id: UuidSchema, position: z.int().min(0), text: z.string(), isCorrect: z.boolean() })),
  testCases: z.array(
    z.strictObject({ position: z.int().min(0), input: z.string(), expectedOutput: z.string(), visibility: TestCaseVisibilitySchema }),
  ),
  topics: z.array(z.strictObject({ syllabusItemId: UuidSchema, title: z.string() })),
});
export type TeacherQuestion = z.infer<typeof TeacherQuestionSchema>;

export const RosterEntrySchema = z.strictObject({
  studentUserId: UuidSchema,
  name: z.string(),
  enrollment: EnrollmentStatusSchema,
  status: RosterStatusSchema,
  attemptId: UuidSchema.nullable(),
  submittedAt: IsoDateTimeSchema.nullable(),
  grade: GradeOutputSchema.nullable(),
  gradePartial: z.boolean().nullable(),
});
export type RosterEntry = z.infer<typeof RosterEntrySchema>;

export const TeacherActivitySchema = TeacherActivitySummarySchema.extend({
  instructions: z.string().nullable(),
  version: z.int().min(1),
  outOfScopeTopicCount: z.int().min(0),
  source: z.union([z.strictObject({ workId: UuidSchema }), z.strictObject({ exerciseIds: z.array(UuidSchema) })]),
  /** In position order. */
  questions: z.array(TeacherQuestionSchema),
  roster: z.array(RosterEntrySchema),
});
export type TeacherActivity = z.infer<typeof TeacherActivitySchema>;

export const QuestionGradingViewSchema = z.strictObject({
  questionId: UuidSchema,
  status: ActivityGradingStatusSchema,
  nature: GradingNatureSchema.exclude(["SUGGESTION"]).nullable(),
  finalGrade: GradeOutputSchema.nullable(),
  teacherGrade: GradeOutputSchema.nullable(),
  pendingReason: PendingReasonSchema.nullable(),
  feedback: z.string().nullable(),
});
export type QuestionGradingView = z.infer<typeof QuestionGradingViewSchema>;

export const TeacherAttemptSchema = z.strictObject({
  id: UuidSchema,
  student: z.strictObject({ userId: UuidSchema, name: z.string() }),
  status: AttemptStatusSchema,
  startedAt: IsoDateTimeSchema,
  lastSavedAt: IsoDateTimeSchema.nullable(),
  answers: z.array(z.strictObject({ questionId: UuidSchema, answer: AnswerSchema, savedAt: IsoDateTimeSchema })),
  submission: z
    .strictObject({
      id: UuidSchema,
      submittedAt: IsoDateTimeSchema,
      late: z.boolean(),
      acceptedByTeacher: z.boolean(),
      blankCount: z.int().min(0),
      grade: GradeOutputSchema,
      gradePartial: z.boolean(),
      generalFeedback: z.string().nullable(),
      version: z.int().min(1),
      gradings: z.array(QuestionGradingViewSchema),
    })
    .nullable(),
});
export type TeacherAttempt = z.infer<typeof TeacherAttemptSchema>;

/**
 * A question's grade decided by the teacher: 0.00 up to 100.00 with at most two decimals (unlike
 * a total grade, 0 is valid). The range against the question's value is the server's rule
 * (`422 GRADE_OUT_OF_RANGE`, 011 `decideByTeacher`).
 */
export const QuestionScoreInputSchema = z
  .string()
  .regex(/^\d{1,3}(\.\d{1,2})?$/)
  .refine((grade) => gradeToCents(grade) <= GRADE_MAX_CENTS, "GRADE_OUT_OF_RANGE");
export type QuestionScoreInput = z.infer<typeof QuestionScoreInputSchema>;

export const GradeSubmissionRequestSchema = z.strictObject({
  version: z.int().min(1),
  decisions: z
    .array(
      z.strictObject({
        questionId: UuidSchema,
        grade: QuestionScoreInputSchema,
        feedback: z.string().max(ACTIVITY_FEEDBACK_MAX).nullish(),
      }),
    )
    .max(ACTIVITY_EXERCISES_MAX)
    .refine((decisions) => new Set(decisions.map((d) => d.questionId)).size === decisions.length, "DUPLICATE_QUESTION"),
  generalFeedback: z.string().max(ACTIVITY_FEEDBACK_MAX).nullish(),
});
export type GradeSubmissionRequest = z.infer<typeof GradeSubmissionRequestSchema>;
