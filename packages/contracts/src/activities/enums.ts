import { z } from "zod";
import { IsoDateTimeSchema } from "../common/primitives.js";

// Public enums of the class activities and the student portal (012 data-model.md, research P3,
// P4, P11). Platform concepts, fixed in code (constitution XXI).

/**
 * The activity's pedagogical type (constitution XXIII). `EXAM` since 018 (research T3): always
 * CONTROLLED, without AI help, `PRESENT_ONLY`, timed per student by the server.
 */
export const ActivityTypeSchema = z.enum(["EXERCISE", "ASSIGNMENT", "EXAM"]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

/**
 * How the activity runs. `CONTROLLED` exists since 015 for works only (015/FR-001, FR-002): fullscreen
 * when available, screen exits and blocked copy/paste recorded, never blocking the attempt.
 */
export const ExecutionModeSchema = z.enum(["NORMAL", "CONTROLLED"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

/** AI help per student in a whole work, fixed by the platform (015/FR-003, research F2). */
export const AI_HELP_ALLOWANCE = 3;

/** An activity's AI help: none, or the platform's fixed allowance (015 research F2). */
export const AiHelpAllowanceSchema = z.union([z.literal(0), z.literal(AI_HELP_ALLOWANCE)]);
export type AiHelpAllowance = z.infer<typeof AiHelpAllowanceSchema>;

/** The stored lifecycle; "agendada"/"publicada" is the derived `PublicationPhase` (research P4). */
export const ActivityStatusSchema = z.enum(["ACTIVE", "CLOSED", "CANCELLED"]);
export type ActivityStatus = z.infer<typeof ActivityStatusSchema>;

/** An ACTIVE activity before or after its publication date, by the server clock; never stored. */
export const PublicationPhaseSchema = z.enum(["SCHEDULED", "PUBLISHED"]);
export type PublicationPhase = z.infer<typeof PublicationPhaseSchema>;

/** What happens after the deadline, chosen by the teacher (012 Clarifications Q2, research P10). */
export const LatePolicySchema = z.enum(["REJECT", "ACCEPT_MARKED"]);
export type LatePolicy = z.infer<typeof LatePolicySchema>;

/**
 * The student's situation in an activity, derived on every read (012/FR-014, contracts/student-status.md):
 * PENDENTE, EM_ANDAMENTO, ATRASADO, ENTREGUE, CORRIGIDO; and CONCLUÍDA, only for an EXERCISE with a
 * concluded attempt (013/FR-014). Labels live in the web.
 */
export const StudentActivityStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "OVERDUE", "SUBMITTED", "GRADED", "COMPLETED"]);
export type StudentActivityStatus = z.infer<typeof StudentActivityStatusSchema>;

/** The filter of "Minhas atividades": `COMPLETED` is SUBMITTED + GRADED ("entregues/concluídas"). */
export const StudentActivityFilterSchema = z.enum(["PENDING", "IN_PROGRESS", "OVERDUE", "COMPLETED"]);
export type StudentActivityFilter = z.infer<typeof StudentActivityFilterSchema>;

/**
 * Each student's situation in the teacher's roster of an activity (contracts/student-status.md);
 * `COMPLETED` only for an EXERCISE whose attempt 1 is concluded (013 contracts/student-status.md);
 * `ABSENT` only for a `PRESENT_ONLY` work, a student not marked present and without an attempt,
 * never counted as `MISSED` (016/FR-019, research M9). EXAM only (018): `AWAITING_DECISION` (an open
 * hold), `TIME_EXPIRED`, `CANCELLED`, `ENDED_BY_WARNINGS` (the submission's end reason) and
 * `START_CLOSED` (present, never started, after the start deadline).
 */
export const RosterStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
  "SUBMITTED_LATE",
  "MISSED",
  "COMPLETED",
  "ABSENT",
  "AWAITING_DECISION",
  "TIME_EXPIRED",
  "CANCELLED",
  "ENDED_BY_WARNINGS",
  "START_CLOSED",
]);
export type RosterStatus = z.infer<typeof RosterStatusSchema>;

/** A student's attempt: never back from SUBMITTED (research P7, P9). */
export const AttemptStatusSchema = z.enum(["IN_PROGRESS", "SUBMITTED"]);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

/**
 * A question's grading in a submission. No AI runs in 012, so there is no suggested state: a rule's
 * result, pending for the teacher, or the teacher's decision (research P12).
 */
export const ActivityGradingStatusSchema = z.enum(["GRADED", "PENDING_TEACHER", "DECIDED"]);
export type ActivityGradingStatus = z.infer<typeof ActivityGradingStatusSchema>;

/**
 * The result of an exercise in a concluded EXERCISE attempt (013 research K6): right or wrong by the
 * rule or the teacher, waiting for the teacher (open answer or code of the scoring attempt), or not
 * scored (open answer or code of a practice attempt: "Compare com o gabarito").
 */
export const ExerciseResultSchema = z.enum(["CORRECT", "WRONG", "PENDING_TEACHER", "UNSCORED"]);
export type ExerciseResult = z.infer<typeof ExerciseResultSchema>;

/**
 * How an EXAM attempt ended, stored on its submission (018 data-model.md, research T5, T9): the
 * student's submission, the time or the activity's close settled on the next touch, or the teacher's
 * decision on a hold ("Não cancelar" → ENDED_BY_WARNINGS; confirmed cancellation → CANCELLED, grade 0).
 */
export const ExamEndReasonSchema = z.enum(["STUDENT_SUBMITTED", "TIME_EXPIRED", "ACTIVITY_CLOSED", "ENDED_BY_WARNINGS", "CANCELLED"]);
export type ExamEndReason = z.infer<typeof ExamEndReasonSchema>;

/** What an exam occurrence was (018 research T6): one kind per countable event family. */
export const ExamOccurrenceKindSchema = z.enum(["SCREEN_LEFT", "FULLSCREEN_EXITED", "CLIPBOARD", "INACTIVITY"]);
export type ExamOccurrenceKind = z.infer<typeof ExamOccurrenceKindSchema>;

/** One occurrence of an exam attempt (018/FR-031): its ordinal, kind and the server's time. */
export const ExamOccurrenceViewSchema = z.strictObject({
  ordinal: z.int().min(1),
  kind: ExamOccurrenceKindSchema,
  recordedAt: IsoDateTimeSchema,
});
export type ExamOccurrenceView = z.infer<typeof ExamOccurrenceViewSchema>;

/**
 * The end reason the student sees (018 research T13): both decisions on a hold read `WARNINGS`
 * until the result release; `CANCELLED` only after it (no grade before the release, 012).
 */
export const StudentExamEndReasonSchema = z.enum(["STUDENT_SUBMITTED", "TIME_EXPIRED", "ACTIVITY_CLOSED", "WARNINGS", "CANCELLED"]);
export type StudentExamEndReason = z.infer<typeof StudentExamEndReasonSchema>;

/** An exam's duration, inactivity limit and start window (018 contracts/configuration.md). */
export const EXAM_DURATION_MINUTES_MIN = 1;
export const EXAM_DURATION_MINUTES_MAX = 120;
export const EXAM_INACTIVITY_SECONDS_MIN = 30;
export const EXAM_INACTIVITY_SECONDS_MAX = 60;
export const EXAM_INACTIVITY_SECONDS_DEFAULT = 60;
export const EXAM_START_WINDOW_MINUTES_MIN = 0;
export const EXAM_START_WINDOW_MINUTES_MAX = 60;
export const EXAM_START_WINDOW_MINUTES_DEFAULT = 15;
