import { z } from "zod";
import { AccountPageSchema, UserAccountViewSchema, UserListQuerySchema } from "./accounts/accounts.js";
import {
  AdminActivatedSchema,
  AdminActivationPreviewSchema,
  AdminActivationRequestSchema,
} from "./admin-activation/admin-activation.js";
import {
  LoginRequestSchema,
  PasswordResetConfirmRequestSchema,
  PasswordResetRequestSchema,
  ResendVerificationRequestSchema,
  VerifyEmailRequestSchema,
} from "./auth/requests.js";
import {
  EmailVerifiedResponseSchema,
  LoginResponseSchema,
  MessageResponseSchema,
  PublicAcceptedSchema,
} from "./auth/responses.js";
import {
  AcceptClassInvitationRequestSchema,
  ClassInvitationAcceptedSchema,
  ClassInvitationListQuerySchema,
  ClassInvitationPageSchema,
  ClassInvitationPreviewSchema,
  ClassInvitationViewSchema,
  InviteStudentRequestSchema,
} from "./classes/class-invitations.js";
import {
  ChangeClassStatusRequestSchema,
  ClassListQuerySchema,
  ClassPageSchema,
  ClassViewSchema,
  CreateClassRequestSchema,
  UpdateClassRequestSchema,
} from "./classes/classes.js";
import { EnrollmentListQuerySchema, EnrollmentPageSchema, EnrollmentViewSchema } from "./classes/enrollments.js";
import { MyClassListSchema } from "./classes/my-classes.js";
import {
  AiExecutionListQuerySchema,
  AiExecutionPageSchema,
  AiExecutionResultSchema,
  AiExecutionViewSchema,
  RequestAiExecutionRequestSchema,
} from "./ai/executions.js";
import {
  AiAgentOperationsViewSchema,
  AiHealthSchema,
  AiMetricsQuerySchema,
  AiMetricsSchema,
  AiModelCatalogViewSchema,
  AiModelConfigViewSchema,
  AiRegistryKeySchema,
  AiTaskPolicyViewSchema,
  ChangeAiAgentStatusRequestSchema,
  ChangeAiModelConfigStatusRequestSchema,
  TaskOverrideRequestSchema,
} from "./ai/operations.js";
import { AiProposalListQuerySchema, AiProposalPageSchema, AiProposalViewSchema, DecideAiProposalRequestSchema } from "./ai/proposals.js";
import { EmptyBodySchema, UuidSchema } from "./common/primitives.js";
import { ClassMeetingListSchema, UpdateClassMeetingsRequestSchema } from "./curriculum/class-meetings.js";
import {
  ChangePlanStatusRequestSchema,
  ClassPlanEnvelopeSchema,
  ClassPlanViewSchema,
  CreateTopicRequestSchema,
  MergeTopicsRequestSchema,
  PlanCoverageSchema,
  ReorderTopicsRequestSchema,
  SelectPlanSyllabusRequestSchema,
  SplitTopicRequestSchema,
  TopicActionRequestSchema,
  TopicListQuerySchema,
  TopicListSchema,
  UpdateTopicRequestSchema,
} from "./curriculum/class-plan.js";
import {
  ChangeSubjectStatusRequestSchema,
  CreateSubjectRequestSchema,
  SubjectListQuerySchema,
  SubjectPageSchema,
  SubjectViewSchema,
  UpdateSubjectRequestSchema,
} from "./curriculum/subjects.js";
import {
  CreateSyllabusRevisionRequestSchema,
  SaveSyllabusRevisionRequestSchema,
  SyllabusDocumentDetailSchema,
  SyllabusDocumentListSchema,
  SyllabusDocumentViewSchema,
  SyllabusFileQuerySchema,
  SyllabusRevisionViewSchema,
  SyllabusUploadResultSchema,
} from "./curriculum/syllabus.js";
import {
  ApplyCurriculumProposalRequestSchema,
  ApplyCurriculumProposalResponseSchema,
  CurriculumAiStatusSchema,
  RequestCurriculumAnalysisRequestSchema,
  RequestCurriculumAnalysisResponseSchema,
} from "./curriculum/curriculum-ai.js";
import {
  CreateExerciseRequestSchema,
  ExerciseListQuerySchema,
  ExercisePageSchema,
  ExerciseSetRequestSchema,
  ExerciseSetSchema,
  ExerciseTeacherViewSchema,
  ExerciseVersionRequestSchema,
  UpdateExerciseRequestSchema,
} from "./exercises/exercises.js";
import { ProgrammingLanguageListSchema } from "./exercises/programming-languages.js";
import { ExerciseBatchRequestSchema } from "./exercises/distribution.js";
import { CreateWorkRequestSchema, WorkStudentViewSchema, WorkTeacherViewSchema } from "./works/works.js";
import {
  ApproveBatchExercisesRequestSchema,
  ExerciseBatchDetailSchema,
  ExerciseBatchListQuerySchema,
  ExerciseBatchPageSchema,
  ExerciseBatchViewSchema,
  ExerciseGenerationAvailabilitySchema,
} from "./exercises/exercise-batches.js";
import { HealthStatusSchema } from "./health/health.js";
import { MeViewSchema } from "./me/me.js";
import { SessionListResponseSchema, SessionViewSchema } from "./me/sessions.js";
import {
  AcceptInvitationRequestSchema,
  InvitationAcceptedSchema,
  InvitationListQuerySchema,
  InvitationListResponseSchema,
  InvitationPreviewSchema,
  InvitationViewSchema,
  InviteRequestSchema,
  TokenRequestSchema,
} from "./provisioning/invitations.js";
import { ManagerListResponseSchema, ManagerViewSchema } from "./provisioning/managers.js";
import { TeacherListQuerySchema, TeacherListResponseSchema, TeacherViewSchema } from "./provisioning/teachers.js";

/** One route of the API (002 data-model §5). `path` is in Nest format, relative to `/api`. */
export interface EndpointContract {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  params?: z.ZodType;
  query?: z.ZodType;
  /** JSON body. Never set on an `upload` route. */
  body?: z.ZodType;
  /**
   * `multipart/form-data` route (004 E5): the file is checked by the API's upload interceptor and
   * inspector, so there is no Zod `body`; the response is still validated.
   */
  upload?: true;
  /** `null`: success without a body (204). `"binary"`: file bytes (004 E18), no schema. */
  response: z.ZodType | null | "binary";
  /** Success status. */
  status: number;
}

export const IdParamsSchema = z.strictObject({ id: UuidSchema });
export type IdParams = z.infer<typeof IdParamsSchema>;

/** A class invitation under its class (003). */
export const ClassInvitationParamsSchema = z.strictObject({ id: UuidSchema, invitationId: UuidSchema });
export type ClassInvitationParams = z.infer<typeof ClassInvitationParamsSchema>;

/** An enrollment under its class (003). */
export const EnrollmentParamsSchema = z.strictObject({ id: UuidSchema, enrollmentId: UuidSchema });
/** A topic of a class's plan (004). */
export const ClassTopicParamsSchema = z.strictObject({ id: UuidSchema, topicId: UuidSchema });
export type ClassTopicParams = z.infer<typeof ClassTopicParamsSchema>;
export type EnrollmentParams = z.infer<typeof EnrollmentParamsSchema>;

export const UserIdParamsSchema = z.strictObject({ userId: UuidSchema });
export type UserIdParams = z.infer<typeof UserIdParamsSchema>;

/** A Curriculum Agent proposal under the syllabus document it targets (007). */
export const CurriculumProposalParamsSchema = z.strictObject({ id: UuidSchema, proposalId: UuidSchema });
export type CurriculumProposalParams = z.infer<typeof CurriculumProposalParamsSchema>;

/**
 * Every route of the API, keyed `<domain>.<action>`. `apps/api/test/contracts/endpoint-catalog.spec.ts`
 * requires a two-way match with the routes registered in Nest, and the test-only conformance
 * interceptor checks each real response against `response`.
 */
export const endpoints = {
  "health.live": { method: "GET", path: "/health/live", response: HealthStatusSchema, status: 200 },
  /** 503 with `{status: "unavailable"}` when the database does not answer. */
  "health.ready": { method: "GET", path: "/health/ready", response: HealthStatusSchema, status: 200 },

  "auth.verifyEmail": {
    method: "POST",
    path: "/auth/verify-email",
    body: VerifyEmailRequestSchema,
    response: EmailVerifiedResponseSchema,
    status: 200,
  },
  "auth.resendVerification": {
    method: "POST",
    path: "/auth/verify-email/resend",
    body: ResendVerificationRequestSchema,
    response: PublicAcceptedSchema,
    status: 202,
  },
  "auth.login": { method: "POST", path: "/auth/login", body: LoginRequestSchema, response: LoginResponseSchema, status: 200 },
  "auth.logout": { method: "POST", path: "/auth/logout", response: null, status: 204 },
  "auth.logoutAll": { method: "POST", path: "/auth/logout-all", response: null, status: 204 },
  "auth.passwordResetRequest": {
    method: "POST",
    path: "/auth/password-reset/request",
    body: PasswordResetRequestSchema,
    response: PublicAcceptedSchema,
    status: 202,
  },
  "auth.passwordResetConfirm": {
    method: "POST",
    path: "/auth/password-reset/confirm",
    body: PasswordResetConfirmRequestSchema,
    response: MessageResponseSchema,
    status: 200,
  },

  "me.get": { method: "GET", path: "/me", response: MeViewSchema, status: 200 },
  "sessions.list": { method: "GET", path: "/me/sessions", response: SessionListResponseSchema, status: 200 },
  "sessions.get": { method: "GET", path: "/me/sessions/:id", params: IdParamsSchema, response: SessionViewSchema, status: 200 },
  "sessions.revoke": { method: "DELETE", path: "/me/sessions/:id", params: IdParamsSchema, response: null, status: 204 },

  "invitations.preview": {
    method: "POST",
    path: "/invitations/preview",
    body: TokenRequestSchema,
    response: InvitationPreviewSchema,
    status: 200,
  },
  "invitations.accept": {
    method: "POST",
    path: "/invitations/accept",
    body: AcceptInvitationRequestSchema,
    response: InvitationAcceptedSchema,
    status: 200,
  },

  "adminActivation.preview": {
    method: "POST",
    path: "/admin-activation/preview",
    body: TokenRequestSchema,
    response: AdminActivationPreviewSchema,
    status: 200,
  },
  "adminActivation.activate": {
    method: "POST",
    path: "/admin-activation",
    body: AdminActivationRequestSchema,
    response: AdminActivatedSchema,
    status: 200,
  },

  "teachers.list": { method: "GET", path: "/teachers", query: TeacherListQuerySchema, response: TeacherListResponseSchema, status: 200 },
  "teachers.get": { method: "GET", path: "/teachers/:userId", params: UserIdParamsSchema, response: TeacherViewSchema, status: 200 },
  "teachers.suspend": {
    method: "POST",
    path: "/teachers/:userId/suspend",
    params: UserIdParamsSchema,
    response: TeacherViewSchema,
    status: 200,
  },
  "teachers.deactivate": {
    method: "POST",
    path: "/teachers/:userId/deactivate",
    params: UserIdParamsSchema,
    response: TeacherViewSchema,
    status: 200,
  },
  "teachers.reactivate": {
    method: "POST",
    path: "/teachers/:userId/reactivate",
    params: UserIdParamsSchema,
    response: TeacherViewSchema,
    status: 200,
  },

  "teacherInvitations.list": {
    method: "GET",
    path: "/teacher-invitations",
    query: InvitationListQuerySchema,
    response: InvitationListResponseSchema,
    status: 200,
  },
  "teacherInvitations.create": {
    method: "POST",
    path: "/teacher-invitations",
    body: InviteRequestSchema,
    response: InvitationViewSchema,
    status: 201,
  },
  "teacherInvitations.resend": {
    method: "POST",
    path: "/teacher-invitations/:id/resend",
    params: IdParamsSchema,
    response: InvitationViewSchema,
    status: 200,
  },
  "teacherInvitations.revoke": {
    method: "POST",
    path: "/teacher-invitations/:id/revoke",
    params: IdParamsSchema,
    response: InvitationViewSchema,
    status: 200,
  },

  "managers.list": { method: "GET", path: "/managers", response: ManagerListResponseSchema, status: 200 },
  "managers.deactivate": {
    method: "POST",
    path: "/managers/:userId/deactivate",
    params: UserIdParamsSchema,
    response: ManagerViewSchema,
    status: 200,
  },
  "managers.reactivate": {
    method: "POST",
    path: "/managers/:userId/reactivate",
    params: UserIdParamsSchema,
    response: ManagerViewSchema,
    status: 200,
  },

  "managerInvitations.list": {
    method: "GET",
    path: "/manager-invitations",
    query: InvitationListQuerySchema,
    response: InvitationListResponseSchema,
    status: 200,
  },
  "managerInvitations.create": {
    method: "POST",
    path: "/manager-invitations",
    body: InviteRequestSchema,
    response: InvitationViewSchema,
    status: 201,
  },
  "managerInvitations.resend": {
    method: "POST",
    path: "/manager-invitations/:id/resend",
    params: IdParamsSchema,
    response: InvitationViewSchema,
    status: 200,
  },
  "managerInvitations.revoke": {
    method: "POST",
    path: "/manager-invitations/:id/revoke",
    params: IdParamsSchema,
    response: InvitationViewSchema,
    status: 200,
  },

  "accounts.list": { method: "GET", path: "/users", query: UserListQuerySchema, response: AccountPageSchema, status: 200 },
  "accounts.get": { method: "GET", path: "/users/:id", params: IdParamsSchema, response: UserAccountViewSchema, status: 200 },
  "accounts.suspend": {
    method: "POST",
    path: "/users/:id/suspend",
    params: IdParamsSchema,
    response: UserAccountViewSchema,
    status: 200,
  },
  "accounts.reactivate": {
    method: "POST",
    path: "/users/:id/reactivate",
    params: IdParamsSchema,
    response: UserAccountViewSchema,
    status: 200,
  },

  "classes.list": { method: "GET", path: "/classes", query: ClassListQuerySchema, response: ClassPageSchema, status: 200 },
  "classes.create": { method: "POST", path: "/classes", body: CreateClassRequestSchema, response: ClassViewSchema, status: 201 },
  "classes.get": { method: "GET", path: "/classes/:id", params: IdParamsSchema, response: ClassViewSchema, status: 200 },
  "classes.update": {
    method: "PATCH",
    path: "/classes/:id",
    params: IdParamsSchema,
    body: UpdateClassRequestSchema,
    response: ClassViewSchema,
    status: 200,
  },
  "classes.changeStatus": {
    method: "POST",
    path: "/classes/:id/status",
    params: IdParamsSchema,
    body: ChangeClassStatusRequestSchema,
    response: ClassViewSchema,
    status: 200,
  },
  "classInvitations.create": {
    method: "POST",
    path: "/classes/:id/invitations",
    params: IdParamsSchema,
    body: InviteStudentRequestSchema,
    response: ClassInvitationViewSchema,
    status: 201,
  },
  "classInvitations.list": {
    method: "GET",
    path: "/classes/:id/invitations",
    params: IdParamsSchema,
    query: ClassInvitationListQuerySchema,
    response: ClassInvitationPageSchema,
    status: 200,
  },
  "classInvitations.resend": {
    method: "POST",
    path: "/classes/:id/invitations/:invitationId/resend",
    params: ClassInvitationParamsSchema,
    body: EmptyBodySchema,
    response: ClassInvitationViewSchema,
    status: 200,
  },
  "classInvitations.cancel": {
    method: "POST",
    path: "/classes/:id/invitations/:invitationId/cancel",
    params: ClassInvitationParamsSchema,
    body: EmptyBodySchema,
    response: ClassInvitationViewSchema,
    status: 200,
  },
  "enrollments.list": {
    method: "GET",
    path: "/classes/:id/enrollments",
    params: IdParamsSchema,
    query: EnrollmentListQuerySchema,
    response: EnrollmentPageSchema,
    status: 200,
  },
  "enrollments.remove": {
    method: "POST",
    path: "/classes/:id/enrollments/:enrollmentId/remove",
    params: EnrollmentParamsSchema,
    body: EmptyBodySchema,
    response: EnrollmentViewSchema,
    status: 200,
  },
  "myClasses.list": { method: "GET", path: "/me/classes", response: MyClassListSchema, status: 200 },
  "classInvitations.preview": {
    method: "POST",
    path: "/class-invitations/preview",
    body: TokenRequestSchema,
    response: ClassInvitationPreviewSchema,
    status: 200,
  },
  "classInvitations.accept": {
    method: "POST",
    path: "/class-invitations/accept",
    body: AcceptClassInvitationRequestSchema,
    response: ClassInvitationAcceptedSchema,
    status: 200,
  },
  "subjects.list": { method: "GET", path: "/subjects", query: SubjectListQuerySchema, response: SubjectPageSchema, status: 200 },
  "subjects.create": {
    method: "POST",
    path: "/subjects",
    body: CreateSubjectRequestSchema,
    response: SubjectViewSchema,
    status: 201,
  },
  "subjects.get": { method: "GET", path: "/subjects/:id", params: IdParamsSchema, response: SubjectViewSchema, status: 200 },
  "subjects.update": {
    method: "PATCH",
    path: "/subjects/:id",
    params: IdParamsSchema,
    body: UpdateSubjectRequestSchema,
    response: SubjectViewSchema,
    status: 200,
  },
  "subjects.changeStatus": {
    method: "POST",
    path: "/subjects/:id/status",
    params: IdParamsSchema,
    body: ChangeSubjectStatusRequestSchema,
    response: SubjectViewSchema,
    status: 200,
  },

  "syllabusDocuments.list": {
    method: "GET",
    path: "/subjects/:id/syllabus-documents",
    params: IdParamsSchema,
    response: SyllabusDocumentListSchema,
    status: 200,
  },
  /** 201 with a new version; 200 with `duplicate: true` when the same file was already sent. */
  "syllabusDocuments.upload": {
    method: "POST",
    path: "/subjects/:id/syllabus-documents",
    params: IdParamsSchema,
    upload: true,
    response: SyllabusUploadResultSchema,
    status: 201,
  },
  "syllabusDocuments.get": {
    method: "GET",
    path: "/syllabus-documents/:id",
    params: IdParamsSchema,
    response: SyllabusDocumentDetailSchema,
    status: 200,
  },
  "syllabusDocuments.download": {
    method: "GET",
    path: "/syllabus-documents/:id/file",
    params: IdParamsSchema,
    query: SyllabusFileQuerySchema,
    response: "binary",
    status: 200,
  },
  "syllabusDocuments.retry": {
    method: "POST",
    path: "/syllabus-documents/:id/retry",
    params: IdParamsSchema,
    body: EmptyBodySchema,
    response: SyllabusDocumentViewSchema,
    status: 202,
  },

  "syllabusRevisions.create": {
    method: "POST",
    path: "/syllabus-documents/:id/revisions",
    params: IdParamsSchema,
    body: CreateSyllabusRevisionRequestSchema,
    response: SyllabusRevisionViewSchema,
    status: 201,
  },
  "syllabusRevisions.get": {
    method: "GET",
    path: "/syllabus-revisions/:id",
    params: IdParamsSchema,
    response: SyllabusRevisionViewSchema,
    status: 200,
  },
  "syllabusRevisions.save": {
    method: "PUT",
    path: "/syllabus-revisions/:id",
    params: IdParamsSchema,
    body: SaveSyllabusRevisionRequestSchema,
    response: SyllabusRevisionViewSchema,
    status: 200,
  },
  /** Confirming a confirmed revision again answers 200 without a change. */
  "syllabusRevisions.confirm": {
    method: "POST",
    path: "/syllabus-revisions/:id/confirm",
    params: IdParamsSchema,
    body: EmptyBodySchema,
    response: SyllabusRevisionViewSchema,
    status: 200,
  },

  "classMeetings.list": {
    method: "GET",
    path: "/classes/:id/meetings",
    params: IdParamsSchema,
    response: ClassMeetingListSchema,
    status: 200,
  },
  /** Adds and removes dates in one save; `planRevision` is null while the class has no plan. */
  "classMeetings.update": {
    method: "PUT",
    path: "/classes/:id/meetings",
    params: IdParamsSchema,
    body: UpdateClassMeetingsRequestSchema,
    response: ClassMeetingListSchema,
    status: 200,
  },

  "classPlans.get": {
    method: "GET",
    path: "/classes/:id/plan",
    params: IdParamsSchema,
    response: ClassPlanEnvelopeSchema,
    status: 200,
  },
  /** Creates the DRAFT plan when the class has none (`planRevision: null`). */
  "classPlans.selectSyllabus": {
    method: "PUT",
    path: "/classes/:id/plan/syllabus",
    params: IdParamsSchema,
    body: SelectPlanSyllabusRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  "classPlans.changeStatus": {
    method: "POST",
    path: "/classes/:id/plan/status",
    params: IdParamsSchema,
    body: ChangePlanStatusRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  "classPlans.coverage": {
    method: "GET",
    path: "/classes/:id/plan/coverage",
    params: IdParamsSchema,
    response: PlanCoverageSchema,
    status: 200,
  },
  "topics.create": {
    method: "POST",
    path: "/classes/:id/plan/topics",
    params: IdParamsSchema,
    body: CreateTopicRequestSchema,
    response: ClassPlanViewSchema,
    status: 201,
  },
  /** Archived topics only (`?status=ARCHIVED`). */
  "topics.listArchived": {
    method: "GET",
    path: "/classes/:id/plan/topics",
    params: IdParamsSchema,
    query: TopicListQuerySchema,
    response: TopicListSchema,
    status: 200,
  },
  "topics.update": {
    method: "PATCH",
    path: "/classes/:id/plan/topics/:topicId",
    params: ClassTopicParamsSchema,
    body: UpdateTopicRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  "topics.merge": {
    method: "POST",
    path: "/classes/:id/plan/topics/merge",
    params: IdParamsSchema,
    body: MergeTopicsRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  "topics.split": {
    method: "POST",
    path: "/classes/:id/plan/topics/:topicId/split",
    params: ClassTopicParamsSchema,
    body: SplitTopicRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  "topics.archive": {
    method: "POST",
    path: "/classes/:id/plan/topics/:topicId/archive",
    params: ClassTopicParamsSchema,
    body: TopicActionRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  "topics.restore": {
    method: "POST",
    path: "/classes/:id/plan/topics/:topicId/restore",
    params: ClassTopicParamsSchema,
    body: TopicActionRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  "topics.complete": {
    method: "POST",
    path: "/classes/:id/plan/topics/:topicId/complete",
    params: ClassTopicParamsSchema,
    body: TopicActionRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  "topics.reopen": {
    method: "POST",
    path: "/classes/:id/plan/topics/:topicId/reopen",
    params: ClassTopicParamsSchema,
    body: TopicActionRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  "topics.reorder": {
    method: "PUT",
    path: "/classes/:id/plan/topic-order",
    params: IdParamsSchema,
    body: ReorderTopicsRequestSchema,
    response: ClassPlanViewSchema,
    status: 200,
  },
  // 006 — AI executions of the session teacher.
  /** 202 with a new execution; 200 when the idempotency key returns an existing one. */
  "aiExecutions.request": {
    method: "POST",
    path: "/ai/executions",
    body: RequestAiExecutionRequestSchema,
    response: AiExecutionViewSchema,
    status: 202,
  },
  "aiExecutions.list": { method: "GET", path: "/ai/executions", query: AiExecutionListQuerySchema, response: AiExecutionPageSchema, status: 200 },
  "aiExecutions.get": { method: "GET", path: "/ai/executions/:id", params: IdParamsSchema, response: AiExecutionViewSchema, status: 200 },
  "aiExecutions.result": { method: "GET", path: "/ai/executions/:id/result", params: IdParamsSchema, response: AiExecutionResultSchema, status: 200 },
  "aiExecutions.cancel": {
    method: "POST",
    path: "/ai/executions/:id/cancel",
    params: IdParamsSchema,
    body: EmptyBodySchema,
    response: AiExecutionViewSchema,
    status: 200,
  },

  // 006 — proposals of L2 agents, reviewed by their teacher.
  "aiProposals.list": { method: "GET", path: "/ai/proposals", query: AiProposalListQuerySchema, response: AiProposalPageSchema, status: 200 },
  "aiProposals.get": { method: "GET", path: "/ai/proposals/:id", params: IdParamsSchema, response: AiProposalViewSchema, status: 200 },
  "aiProposals.decide": {
    method: "POST",
    path: "/ai/proposals/:id/decision",
    params: IdParamsSchema,
    body: DecideAiProposalRequestSchema,
    response: AiProposalViewSchema,
    status: 200,
  },

  // 006 — AI operations for the administrator: aggregates and configuration, never content.
  "aiOperations.health": { method: "GET", path: "/ai/operations/health", response: AiHealthSchema, status: 200 },
  "aiOperations.metrics": { method: "GET", path: "/ai/operations/metrics", query: AiMetricsQuerySchema, response: AiMetricsSchema, status: 200 },
  "aiOperations.agents": { method: "GET", path: "/ai/operations/agents", response: z.array(AiAgentOperationsViewSchema), status: 200 },
  "aiOperations.modelConfigs": { method: "GET", path: "/ai/operations/model-configs", response: z.array(AiModelConfigViewSchema), status: 200 },
  // 009 — the model catalog with approvals and real cost, and the task policies with the current choice.
  "aiOperations.models": { method: "GET", path: "/ai/operations/models", query: AiMetricsQuerySchema, response: z.array(AiModelCatalogViewSchema), status: 200 },
  "aiOperations.tasks": { method: "GET", path: "/ai/operations/tasks", response: z.array(AiTaskPolicyViewSchema), status: 200 },
  /** 009 US7: the administrator's override; the same override again, or none to remove, changes nothing. */
  "aiOperations.setTaskOverride": {
    method: "PUT",
    path: "/ai/operations/tasks/:key/override",
    params: z.strictObject({ key: AiRegistryKeySchema }),
    body: TaskOverrideRequestSchema,
    response: AiTaskPolicyViewSchema,
    status: 200,
  },
  "aiOperations.removeTaskOverride": {
    method: "DELETE",
    path: "/ai/operations/tasks/:key/override",
    params: z.strictObject({ key: AiRegistryKeySchema }),
    response: AiTaskPolicyViewSchema,
    status: 200,
  },
  "aiOperations.changeAgentStatus": {
    method: "POST",
    path: "/ai/operations/agents/:key/status",
    params: z.strictObject({ key: AiRegistryKeySchema }),
    body: ChangeAiAgentStatusRequestSchema,
    response: AiAgentOperationsViewSchema,
    status: 200,
  },
  "aiOperations.changeModelConfigStatus": {
    method: "POST",
    path: "/ai/operations/model-configs/:key/status",
    params: z.strictObject({ key: AiRegistryKeySchema }),
    body: ChangeAiModelConfigStatusRequestSchema,
    response: AiModelConfigViewSchema,
    status: 200,
  },

  // 007 — Curriculum Agent: "Preencher com IA" on a syllabus document.
  "curriculumAi.status": {
    method: "GET",
    path: "/syllabus-documents/:id/ai",
    params: IdParamsSchema,
    response: CurriculumAiStatusSchema,
    status: 200,
  },
  /** 202 with `created: true`; 200 with `created: false` when an active execution already existed. */
  "curriculumAi.requestAnalysis": {
    method: "POST",
    path: "/syllabus-documents/:id/ai-analyses",
    params: IdParamsSchema,
    body: RequestCurriculumAnalysisRequestSchema,
    response: RequestCurriculumAnalysisResponseSchema,
    status: 202,
  },
  /** Repeating the same request after success answers the same body (FR-034). */
  "curriculumAi.applyProposal": {
    method: "POST",
    path: "/syllabus-documents/:id/ai-proposals/:proposalId/apply",
    params: CurriculumProposalParamsSchema,
    body: ApplyCurriculumProposalRequestSchema,
    response: ApplyCurriculumProposalResponseSchema,
    status: 200,
  },

  // 010 — the teacher's exercise bank.
  /** 3–10 exercises, all or nothing. */
  "exercises.createSet": {
    method: "POST",
    path: "/exercises/sets",
    body: ExerciseSetRequestSchema,
    response: ExerciseSetSchema,
    status: 201,
  },
  /** A single exercise (US5-6). */
  "exercises.create": {
    method: "POST",
    path: "/exercises",
    body: CreateExerciseRequestSchema,
    response: ExerciseTeacherViewSchema,
    status: 201,
  },
  /** Keyset page (≤ 50) of the teacher's bank; without `status`, DRAFT and APPROVED (US5-1). */
  "exercises.list": { method: "GET", path: "/exercises", query: ExerciseListQuerySchema, response: ExercisePageSchema, status: 200 },
  "exercises.get": { method: "GET", path: "/exercises/:id", params: IdParamsSchema, response: ExerciseTeacherViewSchema, status: 200 },
  /** The whole content with the version read; ARCHIVED or stale → 409 (US4, research X14). */
  "exercises.update": {
    method: "PUT",
    path: "/exercises/:id",
    params: IdParamsSchema,
    body: UpdateExerciseRequestSchema,
    response: ExerciseTeacherViewSchema,
    status: 200,
  },
  /** DRAFT → APPROVED by the teacher, with reviewer and date; already APPROVED → 200, no event. */
  "exercises.approve": {
    method: "POST",
    path: "/exercises/:id/approve",
    params: IdParamsSchema,
    body: ExerciseVersionRequestSchema,
    response: ExerciseTeacherViewSchema,
    status: 200,
  },
  /** DRAFT | APPROVED → ARCHIVED, the previous status kept; already ARCHIVED → 200, no event (US5-4). */
  "exercises.archive": {
    method: "POST",
    path: "/exercises/:id/archive",
    params: IdParamsSchema,
    body: ExerciseVersionRequestSchema,
    response: ExerciseTeacherViewSchema,
    status: 200,
  },
  /** ARCHIVED → the status before archiving; anything else → 409 (US5-4). */
  "exercises.restore": {
    method: "POST",
    path: "/exercises/:id/restore",
    params: IdParamsSchema,
    body: ExerciseVersionRequestSchema,
    response: ExerciseTeacherViewSchema,
    status: 200,
  },
  /** Only a DRAFT of a batch: removed, and the batch counts it as discarded. */
  "exercises.delete": {
    method: "DELETE",
    path: "/exercises/:id",
    params: IdParamsSchema,
    body: ExerciseVersionRequestSchema,
    response: null,
    status: 204,
  },
  "programmingLanguages.list": {
    method: "GET",
    path: "/programming-languages",
    response: ProgrammingLanguageListSchema,
    status: 200,
  },
  // 010 — "Criar com IA": generation batches.
  "exerciseBatches.availability": {
    method: "GET",
    path: "/exercise-generation/availability",
    response: ExerciseGenerationAvailabilitySchema,
    status: 200,
  },
  /** 202 for a new batch; 200 when the same key and body return the existing one. */
  "exerciseBatches.request": {
    method: "POST",
    path: "/exercise-batches",
    body: ExerciseBatchRequestSchema,
    response: ExerciseBatchViewSchema,
    status: 202,
  },
  "exerciseBatches.list": { method: "GET", path: "/exercise-batches", query: ExerciseBatchListQuerySchema, response: ExerciseBatchPageSchema, status: 200 },
  "exerciseBatches.get": { method: "GET", path: "/exercise-batches/:id", params: IdParamsSchema, response: ExerciseBatchDetailSchema, status: 200 },
  /** Approves several DRAFTs of the batch at once (US4-1, FR-014). */
  "exerciseBatches.approve": {
    method: "POST",
    path: "/exercise-batches/:id/approve",
    params: IdParamsSchema,
    body: ApproveBatchExercisesRequestSchema,
    response: ExerciseSetSchema,
    status: 200,
  },

  // 011 — the teacher's work bank.
  /** A manual work of 1–10 questions, all or nothing; origin MANUAL, no AI (US1). */
  "works.create": { method: "POST", path: "/works", body: CreateWorkRequestSchema, response: WorkTeacherViewSchema, status: 201 },
  /** The active catalog entries, by name; the same shape as the 010 route (research W18). */
  "works.programmingLanguages": {
    method: "GET",
    path: "/works/programming-languages",
    response: ProgrammingLanguageListSchema,
    status: 200,
  },
  "works.get": { method: "GET", path: "/works/:id", params: IdParamsSchema, response: WorkTeacherViewSchema, status: 200 },
  /** "Ver como aluno": the same builder 012 serves to students (research W14). */
  "works.studentPreview": {
    method: "GET",
    path: "/works/:id/student-preview",
    params: IdParamsSchema,
    response: WorkStudentViewSchema,
    status: 200,
  },
} as const satisfies Record<string, EndpointContract>;

export type EndpointKey = keyof typeof endpoints;
