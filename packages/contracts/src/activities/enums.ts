import { z } from "zod";

// Public enums of the class activities and the student portal (012 data-model.md, research P3,
// P4, P11). Platform concepts, fixed in code (constitution XXI).

/**
 * The activity's pedagogical type (constitution XXIII). The exams spec adds `EXAM`; until then no
 * contract, route or screen accepts it (012/FR-003, SC-012).
 */
export const ActivityTypeSchema = z.enum(["EXERCISE", "ASSIGNMENT"]);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;

/** How the activity runs. The exams spec adds `CONTROLLED` (012/FR-003). */
export const ExecutionModeSchema = z.enum(["NORMAL"]);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

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
 * `COMPLETED` only for an EXERCISE whose attempt 1 is concluded (013 contracts/student-status.md).
 */
export const RosterStatusSchema = z.enum(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "SUBMITTED_LATE", "MISSED", "COMPLETED"]);
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
