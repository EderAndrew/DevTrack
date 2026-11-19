import type {
  CohortDetail,
  CohortListQuery,
  CohortPage,
  CohortStatus,
  CohortView,
  CreateCohortRequest,
  UpdateCohortRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const search = (params: CohortListQuery) => {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `?${query}` : "";
};

/** The MANAGER's turmas (027 contracts/http-api.md, "MANAGER — turma"). */
export const cohortsApi = {
  list: (params: CohortListQuery) => apiClient.get<CohortPage>(`/cohorts${search(params)}`),
  get: (id: string) => apiClient.get<CohortDetail>(`/cohorts/${id}`),
  create: (body: CreateCohortRequest) => apiClient.post<CohortView>("/cohorts", body),
  update: (id: string, body: UpdateCohortRequest) => apiClient.patch<CohortView>(`/cohorts/${id}`, body),
  changeStatus: (id: string, to: CohortStatus) => apiClient.post<CohortView>(`/cohorts/${id}/status`, { to }),
};
