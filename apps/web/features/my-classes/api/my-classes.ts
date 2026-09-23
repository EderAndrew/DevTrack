import type { MyClassList } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The student's own classes (003 contracts/http-api.md, "Minhas turmas"). */
export const myClassesApi = {
  list: () => apiClient.get<MyClassList>("/me/classes"),
};
