import type {
  CreateWorkRequest,
  ProgrammingLanguageList,
  WorkStudentView,
  WorkTeacherView,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The teacher's work bank (011 contracts/http-api.md, "Works"). */
export const worksApi = {
  create: (body: CreateWorkRequest) =>
    apiClient.post<WorkTeacherView>("/works", body),
  get: (id: string) => apiClient.get<WorkTeacherView>(`/works/${id}`),
  /** "Ver como aluno": built on the server from an allowlist, with no answer key (US6). */
  studentPreview: (id: string) =>
    apiClient.get<WorkStudentView>(`/works/${id}/student-preview`),
  /** The active languages of the shared catalog, by name (research W18). */
  programmingLanguages: () =>
    apiClient.get<ProgrammingLanguageList>("/works/programming-languages"),
};
