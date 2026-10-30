import type {
  ActivitySource,
  CreateActivityRequest,
  ExamPage,
  ExercisePage,
  GradeSubmissionRequest,
  HelpAvailability,
  IntegritySummaryList,
  IntegrityTimeline,
  MarkExerciseResultsRequest,
  ScopeCheck,
  TeacherActivity,
  TeacherActivityList,
  TeacherAttempt,
  TeacherAttemptGroup,
  TeacherHelpState,
  UpdateActivityRequest,
  WorkPage,
} from "@repo/contracts";
import { ApiError, apiClient } from "@/lib/api/client";

const base = (classId: string) => `/classes/${classId}/activities`;

/** The class's activities, teacher side (012 contracts/http-api.md, "Teacher routes"). */
export const activitiesApi = {
  list: (classId: string) => apiClient.get<TeacherActivityList>(base(classId)),
  get: (classId: string, activityId: string) => apiClient.get<TeacherActivity>(`${base(classId)}/${activityId}`),
  /** Topics of the source outside the class's taught scope (FR-005a). */
  scopeCheck: (classId: string, source: ActivitySource) => apiClient.post<ScopeCheck>(`${base(classId)}/scope-check`, source),
  /** One idempotency key per form: a repeated click returns the same activity (FR-005). */
  create: (classId: string, body: CreateActivityRequest) => apiClient.post<TeacherActivity>(base(classId), body),
  update: (classId: string, activityId: string, body: UpdateActivityRequest) =>
    apiClient.patch<TeacherActivity>(`${base(classId)}/${activityId}`, body),
  close: (classId: string, activityId: string) => apiClient.post<TeacherActivity>(`${base(classId)}/${activityId}/close`, {}),
  cancel: (classId: string, activityId: string) => apiClient.post<TeacherActivity>(`${base(classId)}/${activityId}/cancel`, {}),
  /** The result to the class, the whole activity at once (FR-006). */
  release: (classId: string, activityId: string) => apiClient.post<TeacherActivity>(`${base(classId)}/${activityId}/release`, {}),
  /** 015: whether a Trabalho can be applied or edited with the AI help now (research F3). */
  helpAvailability: () => apiClient.get<HelpAvailability>("/work-help/availability"),
  /** 015: per student with an attempt, the controlled mode's counts and durations (US4). */
  integritySummary: (classId: string, activityId: string) => apiClient.get<IntegritySummaryList>(`${base(classId)}/${activityId}/integrity`),
};

const attemptPath = (classId: string, activityId: string, attemptId: string) => `${base(classId)}/${activityId}/attempts/${attemptId}`;

/** One student's attempt, teacher side (012 US5). */
export const attemptsApi = {
  get: (classId: string, activityId: string, attemptId: string) => apiClient.get<TeacherAttempt>(attemptPath(classId, activityId, attemptId)),
  /** The teacher's grades at the submission's `version` (research P13). */
  grade: (classId: string, activityId: string, attemptId: string, body: GradeSubmissionRequest) =>
    apiClient.put<TeacherAttempt>(`${attemptPath(classId, activityId, attemptId)}/grades`, body),
  /** 013: open answers and code of an Exercício's first conclusion marked right or wrong (FR-017). */
  mark: (classId: string, activityId: string, attemptId: string, body: MarkExerciseResultsRequest) =>
    apiClient.put<TeacherAttempt>(`${attemptPath(classId, activityId, attemptId)}/marks`, body),
  /** The saved answers become a late submission (FR-006b). */
  accept: (classId: string, activityId: string, attemptId: string) =>
    apiClient.post<TeacherAttempt>(`${attemptPath(classId, activityId, attemptId)}/accept-submission`, {}),
  /** 015: the attempt's controlled-mode events, intervals and totals (US4). */
  integrity: (classId: string, activityId: string, attemptId: string) =>
    apiClient.get<IntegrityTimeline>(`${attemptPath(classId, activityId, attemptId)}/integrity`),
  /** 015: the attempt's requests of AI help per question (US4). */
  help: (classId: string, activityId: string, attemptId: string) => apiClient.get<TeacherHelpState>(`${attemptPath(classId, activityId, attemptId)}/help`),
  /** 023: a group attempt's members, editing handoffs and saves per question (US6). */
  group: (classId: string, activityId: string, attemptId: string) =>
    apiClient.get<TeacherAttemptGroup>(`${attemptPath(classId, activityId, attemptId)}/group`),
};

/**
 * Step 1 of "Nova atividade" lists the APPROVED items of the teacher's banks through their own
 * routes (contracts/web-ui.md); this feature never imports the bank features (`activities-boundary`).
 */
export const activitySourcesApi = {
  /** The approved works of the class's subject, first page (≤ 50), latest first. */
  works: (subjectId: string) =>
    apiClient.get<WorkPage>(`/works?${new URLSearchParams({ status: "APPROVED", subjectId, pageSize: "50" })}`),
  /** 018: the approved exams of the class's subject, first page (≤ 50), latest first. */
  exams: (subjectId: string) => apiClient.get<ExamPage>(`/exams?${new URLSearchParams({ status: "APPROVED", subjectId, limit: "50" })}`),
  /** The approved exercises, searched in the statement, first page (≤ 50). */
  exercises: (query: string) =>
    apiClient.get<ExercisePage>(
      `/exercises?${new URLSearchParams({ status: "APPROVED", pageSize: "50", ...(query.trim() ? { query: query.trim() } : {}) })}`,
    ),
};

/** Another tab changed the activity first (`409 ACTIVITY_VERSION_CONFLICT`). */
export const isActivityVersionConflict = (error: unknown) => error instanceof ApiError && error.code === "ACTIVITY_VERSION_CONFLICT";

/** Another tab saved this correction first (`409 SUBMISSION_VERSION_CONFLICT`). */
export const isSubmissionVersionConflict = (error: unknown) => error instanceof ApiError && error.code === "SUBMISSION_VERSION_CONFLICT";
