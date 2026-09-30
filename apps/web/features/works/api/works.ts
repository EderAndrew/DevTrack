import type {
  CreateWorkRequest,
  ProgrammingLanguageList,
  WorkTeacherView,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The teacher's work bank (011 contracts/http-api.md, "Works"). */
export const worksApi = {
  create: (body: CreateWorkRequest) =>
    apiClient.post<WorkTeacherView>("/works", body),
  get: (id: string) => apiClient.get<WorkTeacherView>(`/works/${id}`),
  /** The active languages of the shared catalog, by name (research W18). */
  programmingLanguages: () =>
    apiClient.get<ProgrammingLanguageList>("/works/programming-languages"),
};
