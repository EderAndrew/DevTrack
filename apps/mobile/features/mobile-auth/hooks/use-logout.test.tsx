import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { SessionProvider, useSession } from "../../../lib/session/session-provider";
import { apiError, fakeApi, memoryStore } from "../../../test/render";
import { useLogout } from "./use-logout";

function setup(store = memoryStore("b".repeat(43))) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  queryClient.setQueryData(["mobile-exams"], { items: [], serverNow: "x" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <SessionProvider store={store}>{children}</SessionProvider>
    </QueryClientProvider>
  );
  return { queryClient, store, wrapper };
}

describe("024/US1-4 Sair no aplicativo", () => {
  it("024/US1-4 encerra a sessão no servidor e apaga o segredo e o cache do celular", async () => {
    const api = fakeApi({ "DELETE /auth/mobile/sessions/current": undefined });
    const { queryClient, store, wrapper } = setup();
    const { result } = await renderHook(() => ({ logout: useLogout(), session: useSession() }), { wrapper });
    await waitFor(() => expect(result.current.session.status).toBe("signedIn"));
    await act(async () => {
      await result.current.logout.mutateAsync();
    });
    expect(api.calls.map((call) => `${call.method} ${call.path}`)).toEqual(["DELETE /auth/mobile/sessions/current"]);
    expect(store.cleared).toBe(1);
    expect(queryClient.getQueryData(["mobile-exams"])).toBeUndefined();
    expect(result.current.session).toMatchObject({ status: "signedOut", expired: false });
  });

  it("sem rede, o celular esquece a sessão mesmo assim", async () => {
    fakeApi({ "DELETE /auth/mobile/sessions/current": apiError(0, "NETWORK_ERROR") });
    const { store, wrapper } = setup();
    const { result } = await renderHook(() => ({ logout: useLogout(), session: useSession() }), { wrapper });
    await waitFor(() => expect(result.current.session.status).toBe("signedIn"));
    await act(async () => {
      await result.current.logout.mutateAsync().catch(() => undefined);
    });
    expect(store.cleared).toBe(1);
    expect(result.current.session.status).toBe("signedOut");
  });
});
