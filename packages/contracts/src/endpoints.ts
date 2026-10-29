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
import {
  ActivitySourceSchema,
  CreateActivityRequestSchema,
  ScopeCheckSchema,
  GradeSubmissionRequestSchema,
  TeacherActivityListSchema,
  TeacherActivitySchema,
  TeacherAttemptSchema,
  MarkExerciseResultsRequestSchema,
  UpdateActivityRequestSchema,
} from "./activities/teacher.js";
import {
  SaveAnswersRequestSchema,
  SaveAnswersResultSchema,
  StudentActivityListQuerySchema,
  StudentActivityPageSchema,
  StudentActivitySchema,
  StudentDashboardSchema,
  StartAttemptRequestSchema,
  SubmitAttemptRequestSchema,
} from "./activities/student.js";
import { RetryAttemptRequestSchema, StudentExerciseAttemptSchema } from "./activities/exercise-results.js";
import { ClassRankingSchema } from "./ranking/index.js";
import { CodeRunnerAvailabilitySchema } from "./code-runs/availability.js";
import { AttemptCodeRunSummarySchema } from "./code-runs/review.js";
import { CodeRunSchema, CreateCodeRunRequestSchema, LatestCodeRunSchema } from "./code-runs/run.js";
import { HelpAvailabilitySchema, RequestHelpSchema, StudentHelpItemSchema, StudentHelpStateSchema, TeacherHelpStateSchema } from "./work-help/help.js";
import { RecordIntegrityEventsRequestSchema, RecordIntegrityEventsResultSchema } from "./attempt-integrity/events.js";
import { IntegritySummaryListSchema, IntegrityTimelineSchema, StudentIntegritySchema } from "./attempt-integrity/views.js";
import { AttemptPausesSchema, DeclareExitSchema, MyPauseSchema, StudentPauseSchema, TeacherPauseSchema } from "./attendance/pauses.js";
import { AttendanceBatchSchema, RoomSchema } from "./attendance/room.js";
import { EmptyBodySchema, EmptyResponseSchema, UuidSchema } from "./common/primitives.js";
import { TeacherExamHoldSchema } from "./exam-sessions/holds.js";
import { ExamMonitorSchema } from "./exam-sessions/monitor.js";
import {
  AdminFeedbackPageSchema,
  AdminFeedbackSchema,
  ChangeFeedbackStatusRequestSchema,
  CreateFeedbackRequestSchema,
  FeedbackSummarySchema,
  ListAdminFeedbacksQuerySchema,
  ListMyFeedbacksQuerySchema,
  StudentFeedbackPageSchema,
  StudentFeedbackSchema,
} from "./feedback/feedback.js";
import { ProviderNoticeParamsSchema } from "./mail/notices.js";
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
import {
  CreateWorkRequestSchema,
  UpdateWorkRequestSchema,
  WorkListQuerySchema,
  WorkPageSchema,
  WorkStudentViewSchema,
  WorkTeacherViewSchema,
  WorkVersionRequestSchema,
} from "./works/works.js";
import {
  CreateExamRequestSchema,
  ExamListQuerySchema,
  ExamPageSchema,
  ExamStudentPreviewSchema,
  ExamVersionSchema,
  TeacherExamSchema,
  UpdateExamRequestSchema,
} from "./exams/exam.js";
import { CreateExamGenerationRequestSchema, ExamGenerationAvailabilitySchema, ExamGenerationRequestSchema } from "./exams/generation.js";
import {
  WorkGenerationAvailabilitySchema,
  WorkGenerationRequestListQuerySchema,
  WorkGenerationRequestPageSchema,
  WorkGenerationRequestSchema,
  WorkGenerationRequestViewSchema,
} from "./works/work-generation.js";
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

/** A class's activities (012); the names of contracts/http-api.md. */
export const ClassParamsSchema = z.strictObject({ classId: UuidSchema });
export type ClassParams = z.infer<typeof ClassParamsSchema>;

/** An activity under its class (012). */
export const ClassActivityParamsSchema = z.strictObject({ classId: UuidSchema, activityId: UuidSchema });
export type ClassActivityParams = z.infer<typeof ClassActivityParamsSchema>;

/** A student's attempt under its activity (012). */
export const ClassActivityAttemptParamsSchema = z.strictObject({ classId: UuidSchema, activityId: UuidSchema, attemptId: UuidSchema });
export type ClassActivityAttemptParams = z.infer<typeof ClassActivityAttemptParamsSchema>;

/** One student of the teacher's class in an activity (016/US5: "Pausar aluno"). */
export const ClassActivityStudentParamsSchema = z.strictObject({ classId: UuidSchema, activityId: UuidSchema, studentUserId: UuidSchema });
export type ClassActivityStudentParams = z.infer<typeof ClassActivityStudentParamsSchema>;

/** One room exit of an activity of the teacher's class (016 research M7: a release is keyed by pause). */
export const ClassActivityPauseParamsSchema = z.strictObject({ classId: UuidSchema, activityId: UuidSchema, pauseId: UuidSchema });
export type ClassActivityPauseParams = z.infer<typeof ClassActivityPauseParamsSchema>;

/** One hold of an exam of the teacher's class (018 research T9: a decision is keyed by hold). */
export const ClassActivityHoldParamsSchema = z.strictObject({ classId: UuidSchema, activityId: UuidSchema, holdId: UuidSchema });
export type ClassActivityHoldParams = z.infer<typeof ClassActivityHoldParamsSchema>;

/** One of the session student's activities (012). */
export const MyActivityParamsSchema = z.strictObject({ activityId: UuidSchema });
export type MyActivityParams = z.infer<typeof MyActivityParamsSchema>;

/** A practice attempt by its number (013 research K3): a positive integer in the path. */
export const AttemptNumberSchema = z.coerce.number().pipe(z.int().min(1).max(100_000));
export const MyAttemptParamsSchema = z.strictObject({ activityId: UuidSchema, number: AttemptNumberSchema });
export type MyAttemptParams = z.infer<typeof MyAttemptParamsSchema>;

/** A question of one of the session student's activities (019: its code runs). */
export const MyQuestionParamsSchema = z.strictObject({ activityId: UuidSchema, questionId: UuidSchema });
export type MyQuestionParams = z.infer<typeof MyQuestionParamsSchema>;

/** One of the session student's code runs (019). */
export const MyCodeRunParamsSchema = z.strictObject({ runId: UuidSchema });
export type MyCodeRunParams = z.infer<typeof MyCodeRunParamsSchema>;

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
  /** The teacher's bank: filters, title search, keyset pages; ARCHIVED only when asked (US7, research W19). */
  "works.list": { method: "GET", path: "/works", query: WorkListQuerySchema, response: WorkPageSchema, status: 200 },
  "works.get": { method: "GET", path: "/works/:id", params: IdParamsSchema, response: WorkTeacherViewSchema, status: 200 },
  /** "Ver como aluno": the same builder 012 serves to students (research W14). */
  "works.studentPreview": {
    method: "GET",
    path: "/works/:id/student-preview",
    params: IdParamsSchema,
    response: WorkStudentViewSchema,
    status: 200,
  },
  /** The whole work again with its version; values recalculated; ARCHIVED → 409 (US5, research W16). */
  "works.update": {
    method: "PUT",
    path: "/works/:id",
    params: IdParamsSchema,
    body: UpdateWorkRequestSchema,
    response: WorkTeacherViewSchema,
    status: 200,
  },
  /** DRAFT → APPROVED by a person; already APPROVED → 200 with no event (US5). */
  "works.approve": {
    method: "POST",
    path: "/works/:id/approve",
    params: IdParamsSchema,
    body: WorkVersionRequestSchema,
    response: WorkTeacherViewSchema,
    status: 200,
  },
  /** DRAFT or APPROVED → ARCHIVED; already ARCHIVED → 200 with no event (US7). */
  "works.archive": {
    method: "POST",
    path: "/works/:id/archive",
    params: IdParamsSchema,
    body: WorkVersionRequestSchema,
    response: WorkTeacherViewSchema,
    status: 200,
  },
  /** ARCHIVED → the status it had before; anything else → 409 (US7). */
  "works.restore": {
    method: "POST",
    path: "/works/:id/restore",
    params: IdParamsSchema,
    body: WorkVersionRequestSchema,
    response: WorkTeacherViewSchema,
    status: 200,
  },
  // 018 — the Banco de Provas (contracts/http-api.md): the 011 work routes, mirrored.
  "exams.create": { method: "POST", path: "/exams", body: CreateExamRequestSchema, response: TeacherExamSchema, status: 201 },
  /** The teacher's bank: status, subject, title search, keyset pages; ARCHIVED only when asked. */
  "exams.list": { method: "GET", path: "/exams", query: ExamListQuerySchema, response: ExamPageSchema, status: 200 },
  /** The active catalog entries, by name; the same shape as the 010 and 011 routes. */
  "exams.programmingLanguages": { method: "GET", path: "/exams/programming-languages", response: ProgrammingLanguageListSchema, status: 200 },
  "exams.get": { method: "GET", path: "/exams/:id", params: IdParamsSchema, response: TeacherExamSchema, status: 200 },
  /** "Ver como aluno": an allowlist, never the answer key. */
  "exams.studentPreview": {
    method: "GET",
    path: "/exams/:id/student-preview",
    params: IdParamsSchema,
    response: ExamStudentPreviewSchema,
    status: 200,
  },
  /** The whole exam again with its version; values recalculated; ARCHIVED → 409. */
  "exams.update": { method: "PUT", path: "/exams/:id", params: IdParamsSchema, body: UpdateExamRequestSchema, response: TeacherExamSchema, status: 200 },
  /** DRAFT → APPROVED by a person, every question with its key, difficulty and topics; already APPROVED → 200, no event. */
  "exams.approve": { method: "POST", path: "/exams/:id/approve", params: IdParamsSchema, body: ExamVersionSchema, response: TeacherExamSchema, status: 200 },
  /** DRAFT or APPROVED → ARCHIVED; already ARCHIVED → 200 with no event. */
  "exams.archive": { method: "POST", path: "/exams/:id/archive", params: IdParamsSchema, body: ExamVersionSchema, response: TeacherExamSchema, status: 200 },
  /** ARCHIVED → the status it had before; anything else → 409. */
  "exams.restore": { method: "POST", path: "/exams/:id/restore", params: IdParamsSchema, body: ExamVersionSchema, response: TeacherExamSchema, status: 200 },
  // 018/US7 — "Criar prova com IA": generation requests; the generated exam is a DRAFT of the bank.
  "examGenerationRequests.availability": {
    method: "GET",
    path: "/exam-generation/availability",
    response: ExamGenerationAvailabilitySchema,
    status: 200,
  },
  /** 202 for a new request; 200 when the same key and body return the existing one. */
  "examGenerationRequests.request": {
    method: "POST",
    path: "/exam-generation-requests",
    body: CreateExamGenerationRequestSchema,
    response: ExamGenerationRequestSchema,
    status: 202,
  },
  "examGenerationRequests.get": {
    method: "GET",
    path: "/exam-generation-requests/:id",
    params: IdParamsSchema,
    response: ExamGenerationRequestSchema,
    status: 200,
  },
  // 011 — "Criar trabalho com IA": generation requests.
  "workGenerationRequests.availability": {
    method: "GET",
    path: "/work-generation/availability",
    response: WorkGenerationAvailabilitySchema,
    status: 200,
  },
  /** 202 for a new request; 200 when the same key and body return the existing one. */
  "workGenerationRequests.request": {
    method: "POST",
    path: "/work-generation-requests",
    body: WorkGenerationRequestSchema,
    response: WorkGenerationRequestViewSchema,
    status: 202,
  },
  "workGenerationRequests.list": {
    method: "GET",
    path: "/work-generation-requests",
    query: WorkGenerationRequestListQuerySchema,
    response: WorkGenerationRequestPageSchema,
    status: 200,
  },
  "workGenerationRequests.get": {
    method: "GET",
    path: "/work-generation-requests/:id",
    params: IdParamsSchema,
    response: WorkGenerationRequestViewSchema,
    status: 200,
  },

  // 012 — class activities, the teacher's side.
  /** Every activity of the class, all statuses, by deadline (latest first), with the roster counts (US1). */
  "activities.list": {
    method: "GET",
    path: "/classes/:classId/activities",
    params: ClassParamsSchema,
    response: TeacherActivityListSchema,
    status: 200,
  },
  /** Topics of the source outside the class's taught scope (FR-005a, research P5). */
  "activities.scopeCheck": {
    method: "POST",
    path: "/classes/:classId/activities/scope-check",
    params: ClassParamsSchema,
    body: ActivitySourceSchema,
    response: ScopeCheckSchema,
    status: 200,
  },
  /** 201 for a new activity; 200 when the same idempotency key returns the one it created (FR-005). */
  "activities.create": {
    method: "POST",
    path: "/classes/:classId/activities",
    params: ClassParamsSchema,
    body: CreateActivityRequestSchema,
    response: TeacherActivitySchema,
    status: 201,
  },
  "activities.get": {
    method: "GET",
    path: "/classes/:classId/activities/:activityId",
    params: ClassActivityParamsSchema,
    response: TeacherActivitySchema,
    status: 200,
  },
  /** Title, instructions, deadline, late policy; the publication only while scheduled (FR-004). */
  "activities.update": {
    method: "PATCH",
    path: "/classes/:classId/activities/:activityId",
    params: ClassActivityParamsSchema,
    body: UpdateActivityRequestSchema,
    response: TeacherActivitySchema,
    status: 200,
  },
  /** ACTIVE → CLOSED; already CLOSED → 200 with no event. */
  "activities.close": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/close",
    params: ClassActivityParamsSchema,
    body: EmptyBodySchema,
    response: TeacherActivitySchema,
    status: 200,
  },
  /** ACTIVE | CLOSED → CANCELLED; already CANCELLED → 200 with no event. */
  "activities.cancel": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/cancel",
    params: ClassActivityParamsSchema,
    body: EmptyBodySchema,
    response: TeacherActivitySchema,
    status: 200,
  },
  /** The result to the class, whole activity (FR-006, research P14); already released → 200 with no event. */
  "activities.release": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/release",
    params: ClassActivityParamsSchema,
    body: EmptyBodySchema,
    response: TeacherActivitySchema,
    status: 200,
  },
  /** One student's attempt: answers, gradings and submission (US5); the answer key is in the activity. */
  "activities.getAttempt": {
    method: "GET",
    path: "/classes/:classId/activities/:activityId/attempts/:attemptId",
    params: ClassActivityAttemptParamsSchema,
    response: TeacherAttemptSchema,
    status: 200,
  },
  // 015 — what the teacher sees of the controlled mode and of the AI help (US4, research F13).
  /** Per ACTIVE student with an attempt: exits, time away, drops, blocked gestures, refusals. */
  "activities.integritySummary": {
    method: "GET",
    path: "/classes/:classId/activities/:activityId/integrity",
    params: ClassActivityParamsSchema,
    response: IntegritySummaryListSchema,
    status: 200,
  },
  /** One attempt's events with the server's time, the derived intervals and the totals. */
  "activities.attemptIntegrity": {
    method: "GET",
    path: "/classes/:classId/activities/:activityId/attempts/:attemptId/integrity",
    params: ClassActivityAttemptParamsSchema,
    response: IntegrityTimelineSchema,
    status: 200,
  },
  /** One attempt's helps: questions, orientations and why one was blocked or failed. */
  "activities.attemptHelp": {
    method: "GET",
    path: "/classes/:classId/activities/:activityId/attempts/:attemptId/help",
    params: ClassActivityAttemptParamsSchema,
    response: TeacherHelpStateSchema,
    status: 200,
  },
  // 016 — the attendance of a work (US1, research M3, M5, M8); `409 ATTENDANCE_NOT_REQUIRED` unless PRESENT_ONLY.
  /** The class's ACTIVE students with their presence and situation in the room. */
  "activities.room": {
    method: "GET",
    path: "/classes/:classId/activities/:activityId/attendance",
    params: ClassActivityParamsSchema,
    response: RoomSchema,
    status: 200,
  },
  /** Marks (releases the work) and unmarks, all or nothing; answers the room after the batch. */
  "activities.attendance": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/attendance",
    params: ClassActivityParamsSchema,
    body: AttendanceBatchSchema,
    response: RoomSchema,
    status: 200,
  },
  /** 016/US5: "Pausar aluno"; 201 for a new pause, 200 with the pause already open; not started or submitted → 409. */
  "activities.pauseStudent": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/students/:studentUserId/pause",
    params: ClassActivityStudentParamsSchema,
    body: EmptyBodySchema,
    response: TeacherPauseSchema,
    status: 201,
  },
  /** 016/US3: the teacher releases the return; an already released pause → 200 unchanged; closed → 409. */
  "activities.releasePause": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/pauses/:pauseId/release",
    params: ClassActivityPauseParamsSchema,
    body: EmptyBodySchema,
    response: TeacherPauseSchema,
    status: 200,
  },
  /** 016/US4: "Saídas da sala" in the review, oldest first, with the derived durations (FR-021). */
  "activities.attemptPauses": {
    method: "GET",
    path: "/classes/:classId/activities/:activityId/attempts/:attemptId/pauses",
    params: ClassActivityAttemptParamsSchema,
    response: AttemptPausesSchema,
    status: 200,
  },
  /** 018/US5: the teacher's exam monitor, polled every 5 s (018/FR-025); not an exam → 409. */
  "examSessions.monitor": {
    method: "GET",
    path: "/classes/:classId/activities/:activityId/exam-monitor",
    params: ClassActivityParamsSchema,
    response: ExamMonitorSchema,
    status: 200,
  },
  /** 018/US5: "Confirmar cancelamento" (018/FR-021); a decided hold → 409. */
  "examSessions.cancelHold": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/exam-holds/:holdId/cancel",
    params: ClassActivityHoldParamsSchema,
    body: EmptyBodySchema,
    response: TeacherExamHoldSchema,
    status: 200,
  },
  /** 018/US5: "Devolver prova" while the attempt has time (018/FR-022). */
  "examSessions.returnHold": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/exam-holds/:holdId/return",
    params: ClassActivityHoldParamsSchema,
    body: EmptyBodySchema,
    response: TeacherExamHoldSchema,
    status: 200,
  },
  /** 018/US5: "Não cancelar" once the attempt's end has come (018/FR-023). */
  "examSessions.keepHold": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/exam-holds/:holdId/keep",
    params: ClassActivityHoldParamsSchema,
    body: EmptyBodySchema,
    response: TeacherExamHoldSchema,
    status: 200,
  },
  /** The teacher's grades and feedback at the submission's `version` (research P13). */
  "activities.gradeAttempt": {
    method: "PUT",
    path: "/classes/:classId/activities/:activityId/attempts/:attemptId/grades",
    params: ClassActivityAttemptParamsSchema,
    body: GradeSubmissionRequestSchema,
    response: TeacherAttemptSchema,
    status: 200,
  },
  /** The saved answers become a late submission accepted by the teacher (FR-006b); already submitted → 200. */
  "activities.acceptSubmission": {
    method: "POST",
    path: "/classes/:classId/activities/:activityId/attempts/:attemptId/accept-submission",
    params: ClassActivityAttemptParamsSchema,
    body: EmptyBodySchema,
    response: TeacherAttemptSchema,
    status: 200,
  },
  /** 013 — open answers and code of an EXERCISE's attempt 1 marked right or wrong (research K8); no grade. */
  "activities.markAttempt": {
    method: "PUT",
    path: "/classes/:classId/activities/:activityId/attempts/:attemptId/marks",
    params: ClassActivityAttemptParamsSchema,
    body: MarkExerciseResultsRequestSchema,
    response: TeacherAttemptSchema,
    status: 200,
  },

  // 012 — the student portal: only the session student's ACTIVE enrollments (research P18).
  /** Counts, the next five by deadline and the overdue ones still accepting a submission (FR-010, P17). */
  "myActivities.dashboard": { method: "GET", path: "/me/dashboard", response: StudentDashboardSchema, status: 200 },
  /** "Minhas atividades": by deadline, filtered by situation and type, keyset cursor (FR-012, P16). */
  "myActivities.list": {
    method: "GET",
    path: "/me/activities",
    query: StudentActivityListQuerySchema,
    response: StudentActivityPageSchema,
    status: 200,
  },
  /** The student view of one activity; out of context → 404 and `student_access.denied` (FR-008). */
  "myActivities.get": {
    method: "GET",
    path: "/me/activities/:activityId",
    params: MyActivityParamsSchema,
    response: StudentActivitySchema,
    status: 200,
  },
  /**
   * Starts the single attempt; an existing attempt → 200 with the same one, no event (FR-016). An EXAM
   * requires `{ acceptRules: true }` (018 research T13).
   */
  "myActivities.start": {
    method: "POST",
    path: "/me/activities/:activityId/attempt",
    params: MyActivityParamsSchema,
    body: StartAttemptRequestSchema,
    response: StudentActivitySchema,
    status: 200,
  },
  /** Saves up to 10 answers with their `baseRevision`: SAVED / UNCHANGED / CONFLICT each (research P8). */
  "myActivities.saveAnswers": {
    method: "PUT",
    path: "/me/activities/:activityId/attempt/answers",
    params: MyActivityParamsSchema,
    body: SaveAnswersRequestSchema,
    response: SaveAnswersResultSchema,
    status: 200,
  },
  /** The single submission with the pending answers; already submitted → 200 with the same one (FR-025). */
  "myActivities.submit": {
    method: "POST",
    path: "/me/activities/:activityId/attempt/submit",
    params: MyActivityParamsSchema,
    body: SubmitAttemptRequestSchema,
    response: StudentActivitySchema,
    status: 200,
  },
  // 013 — practice attempts of an EXERCISE (research K4, K5, K10).
  /** "Refazer": attempt `afterNumber + 1`; already created → 200 with the same one, no event. */
  "myActivities.retry": {
    method: "POST",
    path: "/me/activities/:activityId/attempts",
    params: MyActivityParamsSchema,
    body: RetryAttemptRequestSchema,
    response: StudentActivitySchema,
    status: 200,
  },
  /** "Concluir exercícios" with the pending answers; already concluded → 200 with the same conclusion. */
  "myActivities.complete": {
    method: "POST",
    path: "/me/activities/:activityId/attempts/:number/complete",
    params: MyAttemptParamsSchema,
    body: SubmitAttemptRequestSchema,
    response: StudentActivitySchema,
    status: 200,
  },
  // 015 — the controlled mode of a work (research F4).
  /** Records 1–50 events of the own open attempt of a CONTROLLED work with the server's time; a resend → the stored time. */
  "myActivities.recordIntegrityEvents": {
    method: "POST",
    path: "/me/activities/:activityId/attempt/events",
    params: MyActivityParamsSchema,
    body: RecordIntegrityEventsRequestSchema,
    response: RecordIntegrityEventsResultSchema,
    status: 200,
  },
  /** The session student's own events of the attempt, with the derived totals (015/FR-027). */
  "myActivities.integrity": {
    method: "GET",
    path: "/me/activities/:activityId/attempt/integrity",
    params: MyActivityParamsSchema,
    response: StudentIntegritySchema,
    status: 200,
  },
  // 015 — the AI help of a work (research F11).
  /** 202 for a new request of help on a question of the own open attempt; 200 when the same key returns it. */
  "myActivities.requestHelp": {
    method: "POST",
    path: "/me/activities/:activityId/attempt/help",
    params: MyActivityParamsSchema,
    body: RequestHelpSchema,
    response: StudentHelpItemSchema,
    status: 202,
  },
  /** The session student's helps in the attempt: allowance, used (DELIVERED only), pending and items. */
  "myActivities.help": {
    method: "GET",
    path: "/me/activities/:activityId/attempt/help",
    params: MyActivityParamsSchema,
    response: StudentHelpStateSchema,
    status: 200,
  },
  // 016/US3 — "Sair da sala" (research M6, M8).
  /** 201 for a new pause of the own open attempt; 200 with the same pause when one is already open. */
  "myActivities.declareExit": {
    method: "POST",
    path: "/me/activities/:activityId/attempt/pause",
    params: MyActivityParamsSchema,
    body: DeclareExitSchema,
    response: StudentPauseSchema,
    status: 201,
  },
  /** The open pause of the own attempt, or null; polled by the answering page. */
  "myActivities.pause": {
    method: "GET",
    path: "/me/activities/:activityId/attempt/pause",
    params: MyActivityParamsSchema,
    response: MyPauseSchema,
    status: 200,
  },
  // 019/US1 — "Executar" on an EXERCISE CODE question (contracts/http-api.md, research B9, B13).
  /** 202 for a new run; 200 with the session student's pending run (of any question). */
  "codeRuns.create": {
    method: "POST",
    path: "/me/activities/:activityId/questions/:questionId/code-runs",
    params: MyQuestionParamsSchema,
    body: CreateCodeRunRequestSchema,
    response: CodeRunSchema,
    status: 202,
  },
  /** The last run of the question in the student's attempt in progress, or null. */
  "codeRuns.latest": {
    method: "GET",
    path: "/me/activities/:activityId/questions/:questionId/code-runs/latest",
    params: MyQuestionParamsSchema,
    response: LatestCodeRunSchema,
    status: 200,
  },
  /** One run of the session student; polled every `CODE_RUN_POLL_MS` while pending. */
  "codeRuns.get": {
    method: "GET",
    path: "/me/code-runs/:runId",
    params: MyCodeRunParamsSchema,
    response: CodeRunSchema,
    status: 200,
  },
  /** 021/US2-6 — whether the Code Runner can run now, for the teacher applying a work (research Y3). */
  "codeRunner.availability": {
    method: "GET",
    path: "/code-runner/availability",
    response: CodeRunnerAvailabilitySchema,
    status: 200,
  },
  /** 021/US3 — one attempt's runs per CODE question of a work with the option: counts and verdicts, no content (research Y7). */
  "activities.attemptCodeRuns": {
    method: "GET",
    path: "/classes/:classId/activities/:activityId/attempts/:attemptId/code-runs",
    params: ClassActivityAttemptParamsSchema,
    response: AttemptCodeRunSummarySchema,
    status: 200,
  },
  /** A concluded attempt of the session student with its answer key (013/FR-012). */
  "myActivities.getAttempt": {
    method: "GET",
    path: "/me/activities/:activityId/attempts/:number",
    params: MyAttemptParamsSchema,
    response: StudentExerciseAttemptSchema,
    status: 200,
  },
  /** 013 — the ranking of a class where the session student holds an ACTIVE enrollment (FR-019–FR-021). */
  "ranking.mine": {
    method: "GET",
    path: "/me/classes/:classId/ranking",
    params: ClassParamsSchema,
    response: ClassRankingSchema,
    status: 200,
  },
  /** 013 — the full ranking of one of the session teacher's classes (FR-022). */
  "ranking.ofClass": {
    method: "GET",
    path: "/classes/:classId/ranking",
    params: ClassParamsSchema,
    response: ClassRankingSchema,
    status: 200,
  },
  /** 015 — whether a work can be applied with the AI help now (research F3). */
  "workHelp.availability": {
    method: "GET",
    path: "/work-help/availability",
    response: HelpAvailabilitySchema,
    status: 200,
  },
  /**
   * 017 — the e-mail provider's notices (contracts/http-api.md). Public, signed by the provider; the
   * body is the provider's, parsed by the API's adapters, so it has no schema here.
   */
  "mail.notice": {
    method: "POST",
    path: "/mail/notices/:provider",
    params: ProviderNoticeParamsSchema,
    response: EmptyResponseSchema,
    status: 200,
  },
  // 020/US1 — the student sends a feedback to the platform (contracts/http-api.md, research J3, J4).
  /** 201 for a new feedback; 200 with the one already stored under the same `submissionId`. */
  "feedback.create": {
    method: "POST",
    path: "/me/feedbacks",
    body: CreateFeedbackRequestSchema,
    response: StudentFeedbackSchema,
    status: 201,
  },
  // 020/US3 — the student follows their own feedbacks.
  "feedback.listMine": {
    method: "GET",
    path: "/me/feedbacks",
    query: ListMyFeedbacksQuerySchema,
    response: StudentFeedbackPageSchema,
    status: 200,
  },
  // 020/US2 — the ADMIN reads and handles the feedbacks (contracts/http-api.md, research J5–J7).
  "feedback.adminList": {
    method: "GET",
    path: "/feedbacks",
    query: ListAdminFeedbacksQuerySchema,
    response: AdminFeedbackPageSchema,
    status: 200,
  },
  /** The menu badge: the number of RECEIVED feedbacks. */
  "feedback.summary": {
    method: "GET",
    path: "/feedbacks/summary",
    response: FeedbackSummarySchema,
    status: 200,
  },
  "feedback.adminGet": {
    method: "GET",
    path: "/feedbacks/:id",
    params: IdParamsSchema,
    response: AdminFeedbackSchema,
    status: 200,
  },
  /** 409 `INVALID_STATE_TRANSITION` for the same status or a transition `feedback-state.ts` refuses. */
  "feedback.changeStatus": {
    method: "POST",
    path: "/feedbacks/:id/status",
    params: IdParamsSchema,
    body: ChangeFeedbackStatusRequestSchema,
    response: AdminFeedbackSchema,
    status: 200,
  },
} as const satisfies Record<string, EndpointContract>;

export type EndpointKey = keyof typeof endpoints;
