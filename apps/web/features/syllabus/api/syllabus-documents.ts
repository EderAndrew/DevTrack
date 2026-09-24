import type {
  SyllabusDocumentDetail,
  SyllabusDocumentList,
  SyllabusDocumentView,
  SyllabusUploadResult,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** Syllabus documents of a subject (004 contracts/http-api.md, "Ementa: documentos"). */
export const syllabusDocumentsApi = {
  list: (subjectId: string) => apiClient.get<SyllabusDocumentList>(`/subjects/${subjectId}/syllabus-documents`),
  get: (id: string) => apiClient.get<SyllabusDocumentDetail>(`/syllabus-documents/${id}`),
  /** Multipart, field `file`; `onProgress` gets the percentage sent. */
  upload: (subjectId: string, file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.upload<SyllabusUploadResult>(`/subjects/${subjectId}/syllabus-documents`, form, { onProgress });
  },
  retry: (id: string) => apiClient.post<SyllabusDocumentView>(`/syllabus-documents/${id}/retry`, {}),
  /** The original file, through the same-origin rewrite; `inline` only for images (E18). */
  fileUrl: (id: string, inline = false) => `/api/syllabus-documents/${id}/file${inline ? "?view=inline" : ""}`,
};
