import type { StudentActivityFilter, StudentActivityPage, StudentDashboard, ActivityType } from "@repo/contracts";
import { ApiError, apiClient, NETWORK_ERROR } from "@/lib/api/client";

export interface StudentActivityListFilters {
  status: StudentActivityFilter | null;
  type: ActivityType | null;
}

/** The student's own activities (012 contracts/http-api.md, "Student routes"); identity from the session only. */
export const studentActivitiesApi = {
  dashboard: () => apiClient.get<StudentDashboard>("/me/dashboard"),
  list: (filters: StudentActivityListFilters, cursor: string | null) => {
    const query = new URLSearchParams({
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(cursor ? { cursor } : {}),
    });
    return apiClient.get<StudentActivityPage>(`/me/activities${query.size > 0 ? `?${query}` : ""}`);
  },
};

/** The request got no answer: the "sem conexão" state, apart from a load error (FR-033, SC-010). */
export const isOffline = (error: unknown) => error instanceof ApiError && error.code === NETWORK_ERROR;
