import type { ClassRanking } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The class ranking of practice points (013 contracts/http-api.md); identity from the session only. */
export const rankingApi = {
  /** A class where the session student holds an ACTIVE enrollment; otherwise 404 (013/US4-6). */
  mine: (classId: string) => apiClient.get<ClassRanking>(`/me/classes/${classId}/ranking`),
};
