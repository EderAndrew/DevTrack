import type {
  ClassListQuery,
  CohortDirectoryPage,
  CohortDirectoryQuery,
  ClassPage,
  ClassStatus,
  ClassView,
  CreateClassRequest,
  UpdateClassRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const search = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `?${query}` : "";
};

/** A teacher's own disciplinas da turma (027 contracts/http-api.md, "TEACHER"). */
export const classesApi = {
  list: (params: ClassListQuery) => apiClient.get<ClassPage>(`/classes${search(params)}`),
  get: (id: string) => apiClient.get<ClassView>(`/classes/${id}`),
  create: (body: CreateClassRequest) => apiClient.post<ClassView>("/classes", body),
  update: (id: string, body: UpdateClassRequest) => apiClient.patch<ClassView>(`/classes/${id}`, body),
  changeStatus: (id: string, status: ClassStatus) => apiClient.post<ClassView>(`/classes/${id}/status`, { status }),
};

/** The teacher's search of ACTIVE turmas to add a disciplina to (027/FR-016). */
export const cohortDirectoryApi = {
  search: (params: CohortDirectoryQuery) =>
    apiClient.get<CohortDirectoryPage>(`/cohort-directory${search(params)}`),
};
