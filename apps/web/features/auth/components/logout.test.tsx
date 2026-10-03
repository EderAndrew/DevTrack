import { act, renderHook, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogoutButton } from "../../../components/shared/logout-button";
import { makeTestQueryClient, renderWithProviders } from "../../../test/render";
import { useLogoutAll } from "../hooks/use-auth";

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
  });

describe("002/US4-4 logout e \"sair de todos\" descartam o cache (FR-024)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const withPreviousSession = () => {
    const queryClient = makeTestQueryClient();
    queryClient.setQueryData(["sessions", "list"], { items: [{ id: "da-sessao-anterior" }] });
    queryClient.setQueryData(["managers", "list"], { items: [{ name: "Gestora da sessão anterior" }] });
    return queryClient;
  };

  it("Sair limpa o cache antes de navegar para /entrar", async () => {
    fetchMock.mockResolvedValue(reply(204));
    const queryClient = withPreviousSession();
    let cachedAtNavigation = -1;
    router.replace.mockImplementation(() => {
      cachedAtNavigation = queryClient.getQueryCache().getAll().length;
    });
    renderWithProviders(<LogoutButton />, { queryClient });

    await userEvent.setup().click(screen.getByRole("button", { name: "Sair" }));
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/logout");
    expect(cachedAtNavigation).toBe(0);
    expect(router.refresh).toHaveBeenCalled();
  });

  it("012/FR-019 Sair apaga as respostas não enviadas guardadas neste navegador", async () => {
    fetchMock.mockResolvedValue(reply(204));
    window.localStorage.setItem("devtrack:respostas:aluno:atividade", "[]");
    window.localStorage.setItem("outra-preferencia", "fica");
    renderWithProviders(<LogoutButton />, { queryClient: withPreviousSession() });
    await userEvent.setup().click(screen.getByRole("button", { name: "Sair" }));
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(window.localStorage.getItem("devtrack:respostas:aluno:atividade")).toBeNull();
    expect(window.localStorage.getItem("outra-preferencia")).toBe("fica");
    window.localStorage.clear();
  });

  it("Sair com a sessão já encerrada (401) também limpa e sai", async () => {
    fetchMock.mockResolvedValue(reply(401, { statusCode: 401, code: "UNAUTHENTICATED", message: "x" }));
    const queryClient = withPreviousSession();
    renderWithProviders(<LogoutButton />, { queryClient });
    await userEvent.setup().click(screen.getByRole("button", { name: "Sair" }));
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("\"sair de todos\" limpa o cache quando a API confirma", async () => {
    fetchMock.mockResolvedValue(reply(204));
    const queryClient = withPreviousSession();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLogoutAll(), { wrapper });
    await act(() => result.current.mutateAsync());
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/logout-all");
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("\"sair de todos\" recusado mantém os dados (a sessão continua)", async () => {
    fetchMock.mockResolvedValue(reply(429, { statusCode: 429, code: "RATE_LIMITED", message: "x" }));
    const queryClient = withPreviousSession();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLogoutAll(), { wrapper });
    await act(() => result.current.mutateAsync().catch(() => undefined));
    expect(queryClient.getQueryData(["sessions", "list"])).toBeDefined();
  });
});
