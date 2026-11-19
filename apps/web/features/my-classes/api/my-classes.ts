import type { MyCohortList } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The student's own turmas by ano letivo (003 contracts/http-api.md, "Minhas turmas"; 027/US8). */
export const myClassesApi = {
  list: () => apiClient.get<MyCohortList>("/me/classes"),
};
