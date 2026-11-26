import type { StudentCalendar } from "@repo/contracts";
import { ApiError, apiClient } from "@/lib/api/client";

/** "Seu calendário de aulas" (031 contracts/http-api.md); the student comes from the session only. */
export const studentCalendarApi = {
  /** A disciplina da turma of an ACTIVE enrollment; otherwise 404 (031/FR-021). */
  get: (classId: string) =>
    apiClient.get<StudentCalendar>(`/me/classes/${classId}/calendar`),
};

/** A `404`: the matéria is no longer one of the student's (another turma, an ended enrollment). */
export const isNotFound = (error: unknown) =>
  error instanceof ApiError && error.status === 404;
