import type { EnrollmentListQuery, EnrollmentPage } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const search = (params: EnrollmentListQuery) => {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `?${query}` : "";
};

/** Students of a teacher's disciplina da turma, read only (027/FR-021); ending an enrollment is the MANAGER's. */
export const enrollmentsApi = {
  list: (classId: string, params: EnrollmentListQuery) =>
    apiClient.get<EnrollmentPage>(`/classes/${classId}/enrollments${search(params)}`),
};
