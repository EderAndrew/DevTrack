import type {
  CreateWorkRequest,
  ProgrammingLanguageList,
  UpdateWorkRequest,
  WorkGenerationAvailability,
  WorkGenerationRequest,
  WorkGenerationRequestListQuery,
  WorkGenerationRequestPage,
  WorkGenerationRequestView,
  WorkStudentView,
  WorkTeacherView,
} from "@repo/contracts";
import { ApiError, apiClient } from "@/lib/api/client";

/** The teacher's work bank (011 contracts/http-api.md, "Works"). */
export const worksApi = {
  create: (body: CreateWorkRequest) =>
    apiClient.post<WorkTeacherView>("/works", body),
  get: (id: string) => apiClient.get<WorkTeacherView>(`/works/${id}`),
  /** The whole work again with the version it was read at (US5, research W16). */
  update: (id: string, body: UpdateWorkRequest) =>
    apiClient.put<WorkTeacherView>(`/works/${id}`, body),
  /** DRAFT → APPROVED by the teacher (US5). */
  approve: (id: string, version: number) =>
    apiClient.post<WorkTeacherView>(`/works/${id}/approve`, { version }),
  /** "Ver como aluno": built on the server from an allowlist, with no answer key (US6). */
  studentPreview: (id: string) =>
    apiClient.get<WorkStudentView>(`/works/${id}/student-preview`),
  /** The active languages of the shared catalog, by name (research W18). */
  programmingLanguages: () =>
    apiClient.get<ProgrammingLanguageList>("/works/programming-languages"),
};

/** Another tab saved or approved the work first (`409 WORK_VERSION_CONFLICT`, research W16). */
export const isWorkVersionConflict = (error: unknown) =>
  error instanceof ApiError && error.code === "WORK_VERSION_CONFLICT";

/** "Criar trabalho com IA": generation requests (011 contracts/http-api.md, "Generation"). */
export const workGenerationApi = {
  availability: () =>
    apiClient.get<WorkGenerationAvailability>("/work-generation/availability"),
  request: (body: WorkGenerationRequest) =>
    apiClient.post<WorkGenerationRequestView>(
      "/work-generation-requests",
      body,
    ),
  list: ({ cursor }: WorkGenerationRequestListQuery) =>
    apiClient.get<WorkGenerationRequestPage>(
      `/work-generation-requests${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    ),
  get: (id: string) =>
    apiClient.get<WorkGenerationRequestView>(`/work-generation-requests/${id}`),
};
