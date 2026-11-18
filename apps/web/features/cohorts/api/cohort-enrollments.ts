import type {
  CohortEnrollmentPage,
  CohortEnrollmentView,
  EnrollmentListQuery,
  StudentLookupResponse,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const search = (params: EnrollmentListQuery) => {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `?${query}` : "";
};

/** The students of a turma, the MANAGER's (027/FR-034): the e-mail always goes in a POST body, never in the URL. */
export const cohortEnrollmentsApi = {
  list: (cohortId: string, params: EnrollmentListQuery) =>
    apiClient.get<CohortEnrollmentPage>(`/cohorts/${cohortId}/enrollments${search(params)}`),
  lookup: (cohortId: string, email: string) => apiClient.post<StudentLookupResponse>(`/cohorts/${cohortId}/student-lookup`, { email }),
  enroll: (cohortId: string, email: string) => apiClient.post<CohortEnrollmentView>(`/cohorts/${cohortId}/enrollments`, { email }),
};
