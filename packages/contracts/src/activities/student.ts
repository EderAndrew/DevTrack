import { z } from "zod";
import { StudentPauseSchema } from "../attendance/pauses.js";
import { CodeHighlightSchema } from "../common/code-highlight.js";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { QuestionExecutionSchema } from "../code-runs/execution.js";
import { WorkQuestionTypeSchema } from "../works/enums.js";
import { GradeOutputSchema } from "../works/grade.js";
import { AnswerSchema } from "../works/grading.js";
import { EXAM_WARNINGS } from "../exam-sessions/holds.js";
import { DashboardRankingSchema } from "../ranking/index.js";
import {
  AI_HELP_ALLOWANCE,
  ActivityTypeSchema,
  AiHelpAllowanceSchema,
  EXAM_DURATION_MINUTES_MAX,
  EXAM_DURATION_MINUTES_MIN,
  EXAM_INACTIVITY_SECONDS_MAX,
  EXAM_INACTIVITY_SECONDS_MIN,
  ExecutionModeSchema,
  LatePolicySchema,
  StudentActivityFilterSchema,
  StudentActivityStatusSchema,
  ExamOccurrenceViewSchema,
  StudentExamEndReasonSchema,
} from "./enums.js";
import { StudentExerciseAttemptSchema } from "./exercise-results.js";
import { GroupSizeSchema } from "./group.js";
import { PointsSchema } from "./points.js";
import { ACTIVITY_EXERCISES_MAX, ActivityAiHelpSchema } from "./teacher.js";

// The student's side (012 contracts/http-api.md, "Student routes"). Every shape here is built on the
// server from an allowlist (research P15): no answer key, explanation, trick flag, grading strategy,
// private test case or pending reason, and no grade or feedback before the release (FR-029, FR-030).
// An EXERCISE (013) has no grade, deadline or late policy (null here) but points; its answer key
// reaches the student only in a concluded attempt (`exercise-results.ts`).

export const STUDENT_ACTIVITIES_PAGE_SIZE = 20;
export const STUDENT_ACTIVITIES_PAGE_SIZE_MAX = 50;
/** "Próximas atividades" of the dashboard (FR-010). */
export const DASHBOARD_NEXT_MAX = 5;

/** One question as the student may see it (011/FR-033 applied to the snapshot). */
export const StudentQuestionSchema = z.strictObject({
  id: UuidSchema,
  position: z.int().min(0),
  type: WorkQuestionTypeSchema,
  /** ASSIGNMENT only; null for EXERCISE. */
  value: GradeOutputSchema.nullable(),
  /** EXERCISE only: the question's fixed points (013/FR-003). */
  points: PointsSchema.nullable(),
  statement: z.string(),
  instructions: z.string().nullable(),
  starterCode: z.string().nullable(),
  language: z.strictObject({ name: z.string(), highlight: CodeHighlightSchema }).nullable(),
  /** PUBLIC test cases only. */
  publicTestCases: z.array(z.strictObject({ input: z.string(), expectedOutput: z.string() })),
  /** Presentation order; never which one is correct. */
  alternatives: z.array(z.strictObject({ id: UuidSchema, text: z.string() })),
  /** 019: "Executar" of an EXERCISE CODE question (research B17); null on every other question. */
  execution: QuestionExecutionSchema.nullable(),
});
export type StudentQuestion = z.infer<typeof StudentQuestionSchema>;

export const StudentActivitySummarySchema = z.strictObject({
  id: UuidSchema,
  type: ActivityTypeSchema,
  /** CONTROLLED: the work is answered in the focus page (015/FR-006, FR-007). */
  executionMode: ExecutionModeSchema,
  /** The AI help per student in this activity (015/FR-006); 0 when off. */
  aiHelp: ActivityAiHelpSchema,
  title: z.string(),
  /** First 160 characters of the instructions, as plain text. */
  summary: z.string(),
  class: z.strictObject({ id: UuidSchema, name: z.string() }),
  subjectName: z.string().nullable(),
  teacherName: z.string(),
  publishedAt: IsoDateTimeSchema,
  /** ASSIGNMENT only; null for EXERCISE (013/FR-013). */
  deadline: IsoDateTimeSchema.nullable(),
  latePolicy: LatePolicySchema.nullable(),
  status: StudentActivityStatusSchema,
  late: z.boolean(),
  /** Start, save and submit allowed now (contracts/student-status.md). */
  canAnswer: z.boolean(),
  urgent: z.boolean(),
  submittedAt: IsoDateTimeSchema.nullable(),
  /** ASSIGNMENT only; null for EXERCISE. */
  totalGrade: GradeOutputSchema.nullable(),
  /** Only when the result is released and the grading complete; always null for EXERCISE. */
  result: z.strictObject({ grade: GradeOutputSchema, hasFeedback: z.boolean() }).nullable(),
  /**
   * EXERCISE only (null for ASSIGNMENT): the possible points, those of the first conclusion, and
   * whether an answer of it waits for the teacher ("Pontos aguardando correção").
   */
  points: z.strictObject({ possible: PointsSchema, earned: PointsSchema, awaitingCorrection: z.boolean() }).nullable(),
});
export type StudentActivitySummary = z.infer<typeof StudentActivitySummarySchema>;

export const StudentDashboardSchema = z.strictObject({
  firstName: z.string(),
  counts: z.strictObject({
    pending: z.int().min(0),
    inProgress: z.int().min(0),
    overdue: z.int().min(0),
    /** SUBMITTED + GRADED. */
    completed: z.int().min(0),
  }),
  /** PENDING and IN_PROGRESS by deadline, at most `DASHBOARD_NEXT_MAX`. */
  next: z.array(StudentActivitySummarySchema).max(DASHBOARD_NEXT_MAX),
  /** OVERDUE activities that still accept a submission, by deadline. */
  overdueOpen: z.array(StudentActivitySummarySchema),
  /** One per class with ACTIVE enrollment; empty without `ranking.turma.visualizar` (013/FR-021). */
  rankings: z.array(DashboardRankingSchema),
  serverNow: IsoDateTimeSchema,
});
export type StudentDashboard = z.infer<typeof StudentDashboardSchema>;

export const StudentAnswerSchema = z.strictObject({ questionId: UuidSchema, answer: AnswerSchema, revision: z.int().min(1) });
export type StudentAnswer = z.infer<typeof StudentAnswerSchema>;

/**
 * An EXAM as its student sees it (018 research T13), with the server's times: `endsAt` exists from
 * the start; `hold` is the open "Encerrada por avisos"; `endReason` reads `WARNINGS` for both of the
 * teacher's decisions until the result release.
 */
export const StudentExamSchema = z.strictObject({
  durationMinutes: z.int().min(EXAM_DURATION_MINUTES_MIN).max(EXAM_DURATION_MINUTES_MAX),
  inactivityLimitSeconds: z.int().min(EXAM_INACTIVITY_SECONDS_MIN).max(EXAM_INACTIVITY_SECONDS_MAX),
  startDeadline: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema.nullable(),
  occurrences: z.strictObject({ count: z.int().min(0), warningsAllowed: z.literal(EXAM_WARNINGS) }),
  hold: z.strictObject({ openedAt: IsoDateTimeSchema }).nullable(),
  endReason: StudentExamEndReasonSchema.nullable(),
  /** The student's own occurrences, oldest first, only once the attempt has ended (018/FR-031); empty before. */
  ownOccurrences: z.array(ExamOccurrenceViewSchema),
});
export type StudentExam = z.infer<typeof StudentExamSchema>;

const withoutContent = (detail: { questions: unknown[]; attempt: { answers: unknown[] } | null }) =>
  detail.questions.length === 0 && (detail.attempt?.answers.length ?? 0) === 0;

/**
 * The detail of an activity for its student. While `pause` (016/FR-013) or an exam's hold (018) is
 * open the questions and the answers are left out, on every device.
 */
export const StudentActivitySchema = StudentActivitySummarySchema.omit({ result: true }).extend({
  /** With the helps already delivered to the session student (015/FR-020: only DELIVERED count). */
  aiHelp: z.strictObject({ allowance: AiHelpAllowanceSchema, used: z.int().min(0).max(AI_HELP_ALLOWANCE) }),
  /**
   * 023: "Em grupo" with this maximum (leader included), or null for an individual activity. Only on
   * the detail: the list's summary stays as before 023 (SC-007).
   */
  groupSize: GroupSizeSchema.nullable(),
  instructions: z.string().nullable(),
  serverNow: IsoDateTimeSchema,
  /** In position order. */
  questions: z.array(StudentQuestionSchema),
  /** The open attempt (for EXERCISE, the latest one when not concluded), or null. */
  attempt: z
    .strictObject({
      number: z.int().min(1),
      startedAt: IsoDateTimeSchema,
      lastSavedAt: IsoDateTimeSchema.nullable(),
      answers: z.array(StudentAnswerSchema),
    })
    .nullable(),
  submission: z
    .strictObject({ submittedAt: IsoDateTimeSchema, late: z.boolean(), acceptedByTeacher: z.boolean(), blankCount: z.int().min(0) })
    .nullable(),
  /** Only when the result is released and the grading complete (research P14). */
  result: z
    .strictObject({
      grade: GradeOutputSchema,
      generalFeedback: z.string().nullable(),
      questions: z.array(z.strictObject({ questionId: UuidSchema, grade: GradeOutputSchema, feedback: z.string().nullable() })),
    })
    .nullable(),
  /** EXERCISE only: the concluded attempts, newest first (empty for ASSIGNMENT). */
  completedAttempts: z.array(z.strictObject({ number: z.int().min(1), completedAt: IsoDateTimeSchema })),
  /** EXERCISE only: the latest concluded attempt with its answer key (013/FR-012). */
  lastResult: StudentExerciseAttemptSchema.nullable(),
  /** The open pause of the attempt, or null (016/FR-013). */
  pause: StudentPauseSchema.nullable(),
  /** The student's own pauses, oldest first, only after the submission (016/FR-021); empty before. */
  pauses: z.array(StudentPauseSchema),
  /** EXAM only (018); null for the others. */
  exam: StudentExamSchema.nullable(),
})
  .refine((detail) => detail.pause === null || withoutContent(detail), "CONTENT_WHILE_PAUSED")
  .refine((detail) => detail.exam?.hold == null || withoutContent(detail), "CONTENT_WHILE_ON_HOLD");
export type StudentActivity = z.infer<typeof StudentActivitySchema>;

export const StudentActivityListQuerySchema = z.strictObject({
  status: StudentActivityFilterSchema.optional(),
  type: ActivityTypeSchema.optional(),
  /** Opaque, from the previous page's `nextCursor`. */
  cursor: z.string().max(200).optional(),
  pageSize: z.coerce.number().pipe(z.int().min(1).max(STUDENT_ACTIVITIES_PAGE_SIZE_MAX)).optional(),
});
export type StudentActivityListQuery = z.infer<typeof StudentActivityListQuerySchema>;

export const StudentActivityPageSchema = z.strictObject({
  items: z.array(StudentActivitySummarySchema),
  nextCursor: z.string().nullable(),
});
export type StudentActivityPage = z.infer<typeof StudentActivityPageSchema>;

/**
 * `POST /me/activities/:activityId/attempt`: `{}` for a work or exercises; an EXAM requires the
 * acceptance of its rules (018 research T13; the service answers 400 without it).
 */
export const StartAttemptRequestSchema = z.strictObject({ acceptRules: z.literal(true).optional() });
export type StartAttemptRequest = z.infer<typeof StartAttemptRequestSchema>;

const distinctQuestions = (items: readonly { questionId: string }[]) => new Set(items.map((item) => item.questionId)).size === items.length;

/** `baseRevision`: the revision the tab last saw, 0 for none (research P8). */
const AnswerWithRevisionSchema = z.strictObject({ questionId: UuidSchema, answer: AnswerSchema, baseRevision: z.int().min(0) });

export const SaveAnswersRequestSchema = z.strictObject({
  answers: z.array(AnswerWithRevisionSchema).min(1).max(ACTIVITY_EXERCISES_MAX).refine(distinctQuestions, "DUPLICATE_QUESTION"),
});
export type SaveAnswersRequest = z.infer<typeof SaveAnswersRequestSchema>;

export const SaveAnswerOutcomeSchema = z.enum(["SAVED", "UNCHANGED", "CONFLICT", "TYPING_LIMIT_EXCEEDED"]);
export type SaveAnswerOutcome = z.infer<typeof SaveAnswerOutcomeSchema>;

export const SaveAnswersResultSchema = z.strictObject({
  savedAt: IsoDateTimeSchema,
  results: z.array(
    z.discriminatedUnion("outcome", [
      z.strictObject({ questionId: UuidSchema, outcome: z.literal("SAVED"), revision: z.int().min(1) }),
      z.strictObject({ questionId: UuidSchema, outcome: z.literal("UNCHANGED"), revision: z.int().min(1) }),
      /** Another tab saved first: the server's answer replaces the tab's copy. */
      z.strictObject({ questionId: UuidSchema, outcome: z.literal("CONFLICT"), revision: z.int().min(1), answer: AnswerSchema }),
      /**
       * CONTROLLED mode (015/FR-013c, research F7): the answer grew faster than typing allows; the
       * stored answer and its revision (0 when none) stay as they were.
       */
      z.strictObject({ questionId: UuidSchema, outcome: z.literal("TYPING_LIMIT_EXCEEDED"), revision: z.int().min(0) }),
    ]),
  ),
});
export type SaveAnswersResult = z.infer<typeof SaveAnswersResultSchema>;

/** The pending answers go with the submission, under the same revision rule (research P9). */
export const SubmitAttemptRequestSchema = z.strictObject({
  answers: z.array(AnswerWithRevisionSchema).max(ACTIVITY_EXERCISES_MAX).refine(distinctQuestions, "DUPLICATE_QUESTION"),
});
export type SubmitAttemptRequest = z.infer<typeof SubmitAttemptRequestSchema>;
