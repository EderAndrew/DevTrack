import type {
  CreateExamGenerationRequest,
  CreateExamRequest,
  ExamGenerationAvailability,
  ExamGenerationRequest,
  ExamListQuery,
  ExamPage,
  ExamRuleViolation,
  ExamStudentPreview,
  ProgrammingLanguageList,
  TeacherExam,
  UpdateExamRequest,
} from "@repo/contracts";
import { ApiError, apiClient } from "@/lib/api/client";

/** The teacher's Banco de Provas (018 contracts/http-api.md, "Banco de Provas"). */
export const examsApi = {
  create: (body: CreateExamRequest) => apiClient.post<TeacherExam>("/exams", body),
  /** The bank: the filters as the query string, "any" left out. */
  list: (query: ExamListQuery) => {
    const params = new URLSearchParams(
      Object.entries(query).flatMap(([key, value]) => (value === undefined || value === "" ? [] : [[key, String(value)]])),
    );
    const search = params.toString();
    return apiClient.get<ExamPage>(`/exams${search ? `?${search}` : ""}`);
  },
  get: (id: string) => apiClient.get<TeacherExam>(`/exams/${id}`),
  /** The whole exam again with the version it was read at. */
  update: (id: string, body: UpdateExamRequest) => apiClient.put<TeacherExam>(`/exams/${id}`, body),
  /** DRAFT → APPROVED by the teacher. */
  approve: (id: string, version: number) => apiClient.post<TeacherExam>(`/exams/${id}/approve`, { version }),
  archive: (id: string, version: number) => apiClient.post<TeacherExam>(`/exams/${id}/archive`, { version }),
  restore: (id: string, version: number) => apiClient.post<TeacherExam>(`/exams/${id}/restore`, { version }),
  /** "Ver como aluno": built on the server from an allowlist, with no answer key. */
  studentPreview: (id: string) => apiClient.get<ExamStudentPreview>(`/exams/${id}/student-preview`),
  /** The active languages of the shared catalog, by name. */
  programmingLanguages: () => apiClient.get<ProgrammingLanguageList>("/exams/programming-languages"),
};

/** "Criar prova com IA" (018/US7): the request becomes a DRAFT exam of the bank; the teacher approves it. */
export const examGenerationApi = {
  availability: () => apiClient.get<ExamGenerationAvailability>("/exam-generation/availability"),
  request: (body: CreateExamGenerationRequest) => apiClient.post<ExamGenerationRequest>("/exam-generation-requests", body),
  get: (id: string) => apiClient.get<ExamGenerationRequest>(`/exam-generation-requests/${id}`),
};

/** Another tab saved or approved the exam first (`409 EXAM_VERSION_CONFLICT`). */
export const isExamVersionConflict = (error: unknown) => error instanceof ApiError && error.code === "EXAM_VERSION_CONFLICT";

/** The questions the server's rules refused (`422 EXAM_RULES`, `details.violations`), or none. */
export function examRuleViolations(error: unknown): ExamRuleViolation[] {
  if (!(error instanceof ApiError) || error.code !== "EXAM_RULES" || !error.details || !("violations" in error.details)) return [];
  return error.details.violations;
}
