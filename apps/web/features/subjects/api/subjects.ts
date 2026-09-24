import type {
  CreateSubjectRequest,
  SubjectListQuery,
  SubjectPage,
  SubjectStatus,
  SubjectView,
  UpdateSubjectRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const search = (params: SubjectListQuery) => {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `?${query}` : "";
};

/** A teacher's own subjects (004 contracts/http-api.md, "Disciplinas"). */
export const subjectsApi = {
  list: (params: SubjectListQuery) => apiClient.get<SubjectPage>(`/subjects${search(params)}`),
  get: (id: string) => apiClient.get<SubjectView>(`/subjects/${id}`),
  create: (body: CreateSubjectRequest) => apiClient.post<SubjectView>("/subjects", body),
  update: (id: string, body: UpdateSubjectRequest) => apiClient.patch<SubjectView>(`/subjects/${id}`, body),
  changeStatus: (id: string, status: SubjectStatus) =>
    apiClient.post<SubjectView>(`/subjects/${id}/status`, { status }),
};
