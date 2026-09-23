import type { EmptyBody, EnrollmentListQuery, EnrollmentPage, EnrollmentView } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const search = (params: EnrollmentListQuery) => {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== "")
      .map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `?${query}` : "";
};

/** Students of a teacher's class (003 contracts/http-api.md, "Alunos da turma"). */
export const enrollmentsApi = {
  list: (classId: string, params: EnrollmentListQuery) =>
    apiClient.get<EnrollmentPage>(`/classes/${classId}/enrollments${search(params)}`),
  remove: (classId: string, enrollmentId: string) =>
    apiClient.post<EnrollmentView>(`/classes/${classId}/enrollments/${enrollmentId}/remove`, {} satisfies EmptyBody),
};
