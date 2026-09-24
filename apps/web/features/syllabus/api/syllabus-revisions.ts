import type { CreateSyllabusRevisionRequest, SaveSyllabusRevisionRequest, SyllabusRevisionView } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** Reviewed content of a syllabus version (004 contracts/http-api.md, "Ementa: revisões"). */
export const syllabusRevisionsApi = {
  create: (documentId: string, body: CreateSyllabusRevisionRequest) =>
    apiClient.post<SyllabusRevisionView>(`/syllabus-documents/${documentId}/revisions`, body),
  get: (id: string) => apiClient.get<SyllabusRevisionView>(`/syllabus-revisions/${id}`),
  save: (id: string, body: SaveSyllabusRevisionRequest) => apiClient.put<SyllabusRevisionView>(`/syllabus-revisions/${id}`, body),
  confirm: (id: string) => apiClient.post<SyllabusRevisionView>(`/syllabus-revisions/${id}/confirm`, {}),
};
