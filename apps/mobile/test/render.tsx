import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import type { ReactElement, ReactNode } from "react";
import { ApiError, type ApiClient, type Method } from "../lib/api/client";
import { setApiClientForTests } from "../lib/api/instance";
import { SessionProvider, type SessionStore } from "../lib/session/session-provider";
import { ThemeProvider } from "../lib/theme";

/** A session store in memory, with the calls recorded. */
export function memoryStore(initial: string | null = null) {
  let token = initial;
  const store: SessionStore & { saved: string[]; cleared: number } = {
    saved: [],
    cleared: 0,
    read: async () => token,
    save: async (value) => {
      token = value;
      store.saved.push(value);
    },
    clear: async () => {
      token = null;
      store.cleared += 1;
    },
  };
  return store;
}

export type FakeAnswer = unknown | ApiError | ((body: unknown) => unknown);

/**
 * Answers the app's requests by `"METHOD /path"`: a value, an `ApiError` (thrown) or a function of the
 * body. Every call is recorded; an unknown route throws so a test never passes by accident.
 */
export function fakeApi(routes: Record<string, FakeAnswer>) {
  const calls: { method: Method; path: string; body: unknown; anonymous: boolean }[] = [];
  const client: ApiClient = {
    request: async (method, path, options = {}) => {
      calls.push({ method, path, body: options.body, anonymous: Boolean(options.anonymous) });
      const key = `${method} ${path}`;
      if (!(key in routes)) throw new Error(`rota não programada no teste: ${key}`);
      const answer = routes[key];
      if (answer instanceof ApiError) throw answer;
      const value = typeof answer === "function" ? (answer as (body: unknown) => unknown)(options.body) : answer;
      return (options.schema ? options.schema.parse(value) : value) as never;
    },
  };
  setApiClientForTests(client);
  return { calls, routes };
}

export const apiError = (status: number, code: string, retryAfterSeconds: number | null = null) => new ApiError(status, code, code, retryAfterSeconds);

/** Renders inside the app's providers: a fresh query client (no retries), the session and the theme. */
export async function renderApp(ui: ReactElement, options: { store?: SessionStore; queryClient?: QueryClient } = {}) {
  const queryClient = options.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  const store = options.store ?? memoryStore();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SessionProvider store={store}>
        <ThemeProvider theme={null}>{children}</ThemeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
  const view = await render(ui, { wrapper });
  return { ...view, queryClient, store };
}

export const teacherMe = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Professora",
  email: "prof@escola.br",
  emailVerified: true,
  roles: [{ key: "TEACHER", status: "ACTIVE" }],
  permissions: ["chamada.registrar"],
  theme: "DARK",
};
