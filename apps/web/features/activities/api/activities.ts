import type {
  ActivitySource,
  CreateActivityRequest,
  ExercisePage,
  ScopeCheck,
  TeacherActivity,
  TeacherActivityList,
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
};

/**
 * Step 1 of "Nova atividade" lists the APPROVED items of the teacher's banks through their own
 * routes (contracts/web-ui.md); this feature never imports the bank features (`activities-boundary`).
 */
export const activitySourcesApi = {
  /** The approved works of the class's subject, first page (≤ 50), latest first. */
  works: (subjectId: string) =>
    apiClient.get<WorkPage>(`/works?${new URLSearchParams({ status: "APPROVED", subjectId, pageSize: "50" })}`),
  /** The approved exercises, searched in the statement, first page (≤ 50). */
  exercises: (query: string) =>
    apiClient.get<ExercisePage>(
      `/exercises?${new URLSearchParams({ status: "APPROVED", pageSize: "50", ...(query.trim() ? { query: query.trim() } : {}) })}`,
    ),
};

/** Another tab changed the activity first (`409 ACTIVITY_VERSION_CONFLICT`). */
export const isActivityVersionConflict = (error: unknown) => error instanceof ApiError && error.code === "ACTIVITY_VERSION_CONFLICT";
