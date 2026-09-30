import type {
  CreateWorkRequest,
  ProgrammingLanguageList,
  WorkGenerationAvailability,
  WorkGenerationRequest,
  WorkGenerationRequestListQuery,
  WorkGenerationRequestPage,
  WorkGenerationRequestView,
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

/** "Criar trabalho com IA": generation requests (011 contracts/http-api.md, "Generation"). */
export const workGenerationApi = {
  availability: () =>
    apiClient.get<WorkGenerationAvailability>("/work-generation/availability"),
  request: (body: WorkGenerationRequest) =>
    apiClient.post<WorkGenerationRequestView>("/work-generation-requests", body),
  list: ({ cursor }: WorkGenerationRequestListQuery) =>
    apiClient.get<WorkGenerationRequestPage>(
      `/work-generation-requests${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  get: (id: string) =>
    apiClient.get<WorkGenerationRequestView>(`/work-generation-requests/${id}`),
};
