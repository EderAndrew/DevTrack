import { z } from "zod";
import { EnrollmentStatusSchema } from "../classes/enrollments.js";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { ExerciseDifficultySchema } from "../exercises/enums.js";
import { TestCaseVisibilitySchema, WorkGradingStrategySchema, WorkQuestionTypeSchema } from "../works/enums.js";
import { GRADE_MAX_CENTS, GradeOutputSchema, gradeToCents } from "../works/grade.js";
import { AnswerSchema, GradingNatureSchema, PendingReasonSchema } from "../works/grading.js";
import {
  ActivityGradingStatusSchema,
  ActivityStatusSchema,
  ActivityTypeSchema,
  AttemptStatusSchema,
  ExecutionModeSchema,
  ExerciseResultSchema,
  LatePolicySchema,
  PublicationPhaseSchema,
  RosterStatusSchema,
} from "./enums.js";
import { PointsSchema } from "./points.js";

// The teacher's side of class activities (012 contracts/http-api.md, "Teacher routes"). Grades use
// the 011 arithmetic: integer hundredths in code, "0.50" strings on the wire (011 research W3).
// Since 013 an EXERCISE activity has no grade, deadline, late policy or release: those fields are
// null for it, and its questions carry the exercise's difficulty and fixed points (013 research K1, K2).

export const ACTIVITY_EXERCISES_MIN = 1;
export const ACTIVITY_EXERCISES_MAX = 10;
export const ACTIVITY_TITLE_MAX = 200;
export const ACTIVITY_INSTRUCTIONS_MAX = 10_000;
export const ACTIVITY_FEEDBACK_MAX = 5_000;

/** The bank items to apply (research P2): one work, or 1–10 distinct exercises in the chosen order. */
const AssignmentSourceSchema = z.strictObject({ type: z.literal("ASSIGNMENT"), workId: UuidSchema });
const ExerciseSourceSchema = z.strictObject({
  type: z.literal("EXERCISE"),
  exerciseIds: z
    .array(UuidSchema)
    .min(ACTIVITY_EXERCISES_MIN)
    .max(ACTIVITY_EXERCISES_MAX)
    .refine((ids) => new Set(ids).size === ids.length, "DUPLICATE_EXERCISE"),
});
export const ActivitySourceSchema = z.discriminatedUnion("type", [AssignmentSourceSchema, ExerciseSourceSchema]);
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

const createCommon = {
  idempotencyKey: UuidSchema,
  title: TitleSchema,
  instructions: InstructionsSchema.nullish(),
  /** Null: now, by the server clock. */
  publishAt: IsoDateTimeSchema.nullable(),
  acknowledgeOutOfScope: z.boolean(),
};

/** An ASSIGNMENT keeps its work's grade (012), with a deadline and a late policy. */
export const CreateAssignmentRequestSchema = z
  .strictObject({
    ...createCommon,
    source: AssignmentSourceSchema,
    deadline: IsoDateTimeSchema,
    latePolicy: LatePolicySchema,
  })
  .refine(deadlineAfterPublication, { path: ["deadline"], message: "INVALID_SCHEDULE" });
export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentRequestSchema>;

/**
 * An EXERCISE is practice (013/FR-001): strict, so a `totalGrade`, `deadline` or `latePolicy` in the
 * body is refused (400). The points come from the exercises' difficulty, never from the request.
 */
export const CreateExerciseActivityRequestSchema = z.strictObject({
  ...createCommon,
  source: ExerciseSourceSchema,
});
export type CreateExerciseActivityRequest = z.infer<typeof CreateExerciseActivityRequestSchema>;

/** `POST /classes/:classId/activities`: a union by `source.type` (013 contracts/http-api.md). */
export const CreateActivityRequestSchema = z.union([CreateAssignmentRequestSchema, CreateExerciseActivityRequestSchema]);
export type CreateActivityRequest = z.infer<typeof CreateActivityRequestSchema>;

export const UpdateActivityRequestSchema = z
  .strictObject({
    version: z.int().min(1),
    title: TitleSchema.optional(),
    instructions: InstructionsSchema.nullable().optional(),
    /** Only while scheduled (`422 ALREADY_PUBLISHED`). */
    publishAt: IsoDateTimeSchema.optional(),
    /** ASSIGNMENT only: an EXERCISE has neither, so the service answers 400 to them (013/FR-004). */
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
  /** ASSIGNMENT only; null for EXERCISE (013/FR-013). */
  deadline: IsoDateTimeSchema.nullable(),
  latePolicy: LatePolicySchema.nullable(),
  totalGrade: GradeOutputSchema.nullable(),
  /** EXERCISE only: the sum of its exercises' points (013/FR-003); null for ASSIGNMENT. */
  possiblePoints: PointsSchema.nullable(),
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
  /** ASSIGNMENT only; null for EXERCISE. */
  value: GradeOutputSchema.nullable(),
  /** EXERCISE only: the exercise's difficulty and fixed points, copied at application (013/FR-002). */
  difficulty: ExerciseDifficultySchema.nullable(),
  points: PointsSchema.nullable(),
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
  /** EXERCISE only: the points of the student's attempt 1 (013/FR-016); null for ASSIGNMENT. */
  pointsEarned: PointsSchema.nullable(),
  /** EXERCISE only: answers of attempt 1 waiting for the teacher's mark; null for ASSIGNMENT. */
  pendingMarks: z.int().min(0).nullable(),
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

/** One exercise of a concluded EXERCISE attempt, for the teacher (013 contracts/http-api.md). */
export const TeacherExerciseResultSchema = z.strictObject({
  questionId: UuidSchema,
  result: ExerciseResultSchema,
  points: PointsSchema,
  /** The row that counts for this exercise in the class (attempt 1, slot free). */
  scoring: z.boolean(),
  /** Attempt 1, but the exercise already scored in another activity of the class (013/FR-010a). */
  alreadyScored: z.boolean(),
  nature: GradingNatureSchema.exclude(["SUGGESTION"]).nullable(),
  comment: z.string().nullable(),
  decidedAt: IsoDateTimeSchema.nullable(),
});
export type TeacherExerciseResult = z.infer<typeof TeacherExerciseResultSchema>;

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
  /** EXERCISE only: the concluded attempt's number, time and results; null otherwise (013/FR-016). */
  exercise: z
    .strictObject({ number: z.int().min(1), completedAt: IsoDateTimeSchema, results: z.array(TeacherExerciseResultSchema) })
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

export const EXERCISE_COMMENT_MAX = 2_000;

/**
 * `PUT …/attempts/:attemptId/marks` (013/FR-017, research K8): the teacher marks open answers and
 * code of attempt 1 right or wrong — the absolute result, never a grade — with an optional comment.
 */
export const MarkExerciseResultsRequestSchema = z.strictObject({
  marks: z
    .array(
      z.strictObject({
        questionId: UuidSchema,
        result: z.enum(["CORRECT", "WRONG"]),
        comment: z.string().max(EXERCISE_COMMENT_MAX).nullish(),
      }),
    )
    .min(1)
    .max(ACTIVITY_EXERCISES_MAX)
    .refine((marks) => new Set(marks.map((mark) => mark.questionId)).size === marks.length, "DUPLICATE_QUESTION"),
});
export type MarkExerciseResultsRequest = z.infer<typeof MarkExerciseResultsRequestSchema>;
