import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api/client";

/**
 * Server state of the app (constitution 3.7.0: TanStack Query). A refused request (4xx) is not retried —
 * it won't pass on a retry and a 401 already sent the app to "Entrar"; network failures retry twice.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
