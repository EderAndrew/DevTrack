import type { SessionListResponse } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The caller's own sessions (`/me/sessions`). */
export const sessionsApi = {
  list: () => apiClient.get<SessionListResponse>("/me/sessions"),
  revoke: (id: string) => apiClient.delete<void>(`/me/sessions/${encodeURIComponent(id)}`),
};
