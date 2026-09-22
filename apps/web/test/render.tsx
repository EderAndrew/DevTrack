import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

export interface RenderWithProvidersOptions extends Omit<RenderOptions, "wrapper"> {
  /**
   * Defaults to a fresh client per test with the browser's defaults (lib/query/query-client.ts)
   * but without retries, so failures surface at once.
   */
  queryClient?: QueryClient;
}

export const makeTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

/** `render` inside the same providers as `app/providers.tsx` (002 web-architecture §Testes). */
export function renderWithProviders(
  ui: ReactElement,
  { queryClient = makeTestQueryClient(), ...options }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  return {
    queryClient,
    ...render(ui, {
      ...options,
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    }),
  };
}
