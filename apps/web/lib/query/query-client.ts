import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, NETWORK_ERROR } from "../api/client";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: QueryMeta;
    mutationMeta: QueryMeta;
  }
}

interface QueryMeta extends Record<string, unknown> {
  /**
   * `false` for public flows where 401 is an answer to show (INVALID_CREDENTIALS,
   * SIGN_IN_REQUIRED), not a session the API stopped accepting.
   */
  authRedirect?: boolean;
}

export interface QueryClientOptions {
  /** Full navigation by default: nothing of the previous session survives in memory. */
  navigate?: (url: string) => void;
  currentPath?: () => string;
  /** Delay between network retries; tests pass 0. */
  retryDelay?: number;
}

const MAX_NETWORK_RETRIES = 2;

/**
 * The browser's `QueryClient` (002 S10): retries only requests that never got an answer, keeps
 * data fresh for 30 s, and on a refused session (401) drops every cached response and goes to the
 * login page, coming back to the current route afterwards (FR-024).
 */
export function makeQueryClient({
  navigate = (url) => window.location.assign(url),
  currentPath = () => `${window.location.pathname}${window.location.search}`,
  retryDelay,
}: QueryClientOptions = {}): QueryClient {
  const onError = (error: unknown, meta: QueryMeta | undefined) => {
    if (!(error instanceof ApiError) || error.status !== 401 || meta?.authRedirect === false) return;
    client.clear();
    navigate(`/entrar?next=${encodeURIComponent(currentPath())}`);
  };

  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: (error, query) => onError(error, query.meta) }),
    mutationCache: new MutationCache({ onError: (error, _variables, _context, mutation) => onError(error, mutation.meta) }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) =>
          error instanceof ApiError && error.code === NETWORK_ERROR && failureCount < MAX_NETWORK_RETRIES,
        ...(retryDelay === undefined ? {} : { retryDelay }),
      },
      // A POST that failed on the network may still have reached the API: never repeat it.
      mutations: { retry: false },
    },
  });
  return client;
}
