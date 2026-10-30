import { z } from "zod";
import { CodeRunUnavailableReasonSchema } from "../code-runs/enums.js";
import { UuidSchema } from "./primitives.js";

// Public error codes of the API, in the order of ErrorCatalog in
// apps/api/src/platform/http/errors.ts (002 S8). User-facing texts are not part of the
// contract: the API keeps its own messages and the web has its own catalog.
export const ErrorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "WEAK_PASSWORD",
  "PASSWORD_REQUIRED",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "RA_REQUIRED",
  "FILE_TYPE_NOT_ALLOWED",
  "FILE_UNREADABLE",
  "FILE_PROTECTED",
  "FILE_MACROS",
  "FILE_TOO_COMPLEX",
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "SIGN_IN_REQUIRED",
  "FORBIDDEN",
  "EMAIL_NOT_VERIFIED",
  "ACCOUNT_SUSPENDED",
  "WRONG_ACCOUNT",
  "SELF_INVITE_FORBIDDEN",
  "SELF_ACTION_FORBIDDEN",
  "ORIGIN_NOT_ALLOWED",
  "NOT_FOUND",
  "INVALID_STATE_TRANSITION",
  "ALREADY_TEACHER",
  "ALREADY_MANAGER",
  "TEACHER_REACTIVATION_REQUIRED",
  "INVITATION_ALREADY_PENDING",
  "LAST_ADMIN_PROTECTED",
  "BOOTSTRAP_ALREADY_DONE",
  "CLASS_CODE_TAKEN",
  "CLASS_NOT_OPEN",
  "ALREADY_ENROLLED",
  "RA_TAKEN",
  "SUBJECT_NAME_TAKEN",
  "SUBJECT_INACTIVE",
  "CLASS_SUBJECT_LOCKED",
  "MEETINGS_OUTSIDE_PERIOD",
  "REVISION_DRAFT_EXISTS",
  "REVISION_CONFIRMED",
  "MEETING_HAS_TOPICS",
  "PLAN_REVISION_CONFLICT",
  "PLAN_ARCHIVED",
  "FILE_TOO_LARGE",
  "CLASS_NOT_PLANNABLE",
  "EXTRACTION_UNAVAILABLE",
  "REVISION_EMPTY",
  "REVISION_NOT_CONFIRMED",
  "MEETING_OUT_OF_PERIOD",
  "TOO_MANY_MEETINGS",
  "SYLLABUS_REQUIRED",
  "SYLLABUS_ITEM_NOT_IN_PLAN",
  "PLAN_HAS_NO_TOPICS",
  "TOO_MANY_TOPICS",
  "MEETING_NOT_HELD_YET",
  "AI_AGENT_NOT_FOUND",
  "AI_AGENT_DISABLED",
  "AI_MODEL_UNAVAILABLE",
  "AI_EXECUTION_LIMIT_EXCEEDED",
  "AI_IDEMPOTENCY_KEY_REUSED",
  "AI_PROPOSAL_ITEMS_INVALID",
  "AI_RESOURCE_TYPE_NOT_ACCEPTED",
  "AI_PROPOSAL_APPLY_REQUIRED",
  "AI_OVERRIDE_NOT_ALLOWED",
  "EXERCISE_VERSION_CONFLICT",
  "WORK_VERSION_CONFLICT",
  "SUBJECT_ARCHIVED",
  "SYLLABUS_LANGUAGE_REQUIRED",
  "SYLLABUS_NOT_READY_FOR_AI",
  "CURRICULUM_PROPOSAL_PENDING",
  "CURRICULUM_SOURCE_CHANGED",
  "CURRICULUM_PROPOSAL_INVALID",
  "SUBJECT_MISMATCH",
  "OUT_OF_SCOPE_NOT_ACKNOWLEDGED",
  "SOURCE_NOT_APPROVED",
  "INVALID_SCHEDULE",
  "ALREADY_PUBLISHED",
  "CLASS_NOT_ACTIVE",
  "ACTIVITY_VERSION_CONFLICT",
  "SUBMISSION_VERSION_CONFLICT",
  "NOT_SUBMITTED",
  "GRADE_OUT_OF_RANGE",
  "UNKNOWN_QUESTION",
  "NOT_STARTED",
  "ATTEMPT_ALREADY_SUBMITTED",
  "ANSWER_CHANGED_ELSEWHERE",
  "DEADLINE_PASSED",
  "ACTIVITY_CLOSED",
  "INVALID_ANSWER",
  "STUDENT_CAN_STILL_SUBMIT",
  "ATTEMPT_NOT_COMPLETED",
  "NOT_LATEST_ATTEMPT",
  "NOT_MARKABLE",
  "AI_HELP_UNAVAILABLE",
  "ACTIVITY_ALREADY_STARTED",
  "NOT_CONTROLLED",
  "HELP_PENDING",
  "HELP_EXHAUSTED",
  "HELP_NOT_ENABLED",
  "TYPING_LIMIT_EXCEEDED",
  "ATTEMPT_PAUSED",
  "ATTENDANCE_STARTED",
  "ATTENDANCE_NOT_REQUIRED",
  "STUDENT_NOT_IN_CLASS",
  "EXAM_RULES",
  "EXAM_VERSION_CONFLICT",
  "EXAM_ARCHIVED",
  "EXAM_NOT_APPROVED",
  "EXAM_START_CLOSED",
  "EXAM_TIME_OVER",
  "EXAM_ATTEMPT_ON_HOLD",
  "EXAM_TIME_NOT_OVER",
  "EXAM_DECISIONS_PENDING",
  "EXIT_NOT_ALLOWED",
  "NOT_AN_EXAM",
  "CODE_RUN_NOT_AVAILABLE",
  "CODE_RUNNER_UNAVAILABLE",
  "SOURCE_TOO_LARGE",
  "ATTEMPT_NOT_IN_PROGRESS",
  "CODE_EXECUTION_NOT_ELIGIBLE",
  "GROUP_NEEDS_ATTENDANCE",
  "EXERCISE_RULES",
  "NOTICE_REJECTED",
  "NOTICE_TOO_LARGE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * One rule an exam's question breaks (018 `422 EXAM_RULES`): its 0-based position, the field and a
 * code, so the editor points at the question. Never the question's text. The exercise bank's `422
 * EXERCISE_RULES` (019) uses the same shape: the exercise's index in the request, the field inside it
 * (`testCases.3.expectedOutput`) and the rule's code.
 */
export const ExamRuleViolationSchema = z.strictObject({
  position: z.int().min(0),
  field: z.string().regex(/^[A-Za-z][A-Za-z0-9_.]{0,63}$/),
  reason: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
});
export type ExamRuleViolation = z.infer<typeof ExamRuleViolationSchema>;

/**
 * What a refusal names for the caller to act on, only where its contract says so: the students of
 * the teacher's own class who already started (016 `409 ATTENDANCE_STARTED`), the questions an exam's
 * or an exercise's rules refuse (018 `422 EXAM_RULES`, 019 `422 EXERCISE_RULES`), the holds still waiting for a decision (018 `409
 * EXAM_DECISIONS_PENDING`) and why a code question can't run (019 `409 CODE_RUN_NOT_AVAILABLE`).
 * Ids, positions, codes and counts only, never data.
 */
export const ErrorDetailsSchema = z.union([
  z.strictObject({ studentUserIds: z.array(UuidSchema).min(1) }),
  z.strictObject({ violations: z.array(ExamRuleViolationSchema).min(1) }),
  z.strictObject({ count: z.int().min(1) }),
  z.strictObject({ reason: CodeRunUnavailableReasonSchema }),
]);
export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

/** Every error response of the API: {statusCode, code, message}, plus `details` where a contract lists them. */
export const ErrorBodySchema = z.strictObject({
  statusCode: z.int(),
  code: ErrorCodeSchema,
  message: z.string(),
  details: ErrorDetailsSchema.optional(),
});
export type ErrorBody = z.infer<typeof ErrorBodySchema>;
