import type { QueryClient } from "@tanstack/react-query";
import { expect, vi } from "vitest";

/**
 * FR-027: a token received by URL is in no query (key or data) and in no browser storage. After
 * the component unmounts, no mutation keeps it either (token mutations use `gcTime: 0`).
 */
export async function expectTokenNotKept(queryClient: QueryClient, token: string, { unmounted = false } = {}) {
  const queries = queryClient.getQueryCache().getAll();
  expect(JSON.stringify(queries.map((query) => [query.queryKey, query.state.data]))).not.toContain(token);
  expect(window.localStorage.length).toBe(0);
  expect(window.sessionStorage.length).toBe(0);
  if (unmounted) {
    await vi.waitFor(() =>
      expect(JSON.stringify(queryClient.getMutationCache().getAll().map((m) => m.state.variables))).not.toContain(token),
    );
  }
}

/** A fetch that stays pending until `release()`, to click twice while the first request is in flight. */
export function pendingResponse(fetchMock: { mockImplementation: (fn: () => Promise<Response>) => unknown }, response: () => Response) {
  let release: () => void = () => undefined;
  fetchMock.mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        release = () => resolve(response());
      }),
  );
  return () => release();
}
