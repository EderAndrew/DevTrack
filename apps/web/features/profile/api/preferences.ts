import type { PreferencesView, UpdatePreferencesRequest } from "@repo/contracts";
import { ApiError, apiClient } from "@/lib/api/client";

/** The own account's preferences (022 contracts/http-api.md): only the session's user, never an id. */
export const preferencesApi = {
  update: (body: UpdatePreferencesRequest) => apiClient.patch<PreferencesView>("/me/preferences", body),
};

/** The session ended before the save (401): the screen shows the app's usual message for it. */
export const isSessionExpired = (error: unknown) => error instanceof ApiError && error.status === 401;
