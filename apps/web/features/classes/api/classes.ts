import type {
  ClassListQuery,
  ClassPage,
  ClassStatus,
  ClassView,
  CreateClassRequest,
  UpdateClassRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const search = (params: ClassListQuery) => {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `?${query}` : "";
};

/** A teacher's own classes (003 contracts/http-api.md, "Turmas"). */
export const classesApi = {
  list: (params: ClassListQuery) => apiClient.get<ClassPage>(`/classes${search(params)}`),
  get: (id: string) => apiClient.get<ClassView>(`/classes/${id}`),
  create: (body: CreateClassRequest) => apiClient.post<ClassView>("/classes", body),
  update: (id: string, body: UpdateClassRequest) => apiClient.patch<ClassView>(`/classes/${id}`, body),
  /** The 004 link of a subject; refused since 027 FR-019 (see `useLinkClassToSubject`). */
  linkSubject: (id: string, subjectId: string) => apiClient.patch<ClassView>(`/classes/${id}`, { subjectId }),
  changeStatus: (id: string, status: ClassStatus) => apiClient.post<ClassView>(`/classes/${id}/status`, { status }),
};
