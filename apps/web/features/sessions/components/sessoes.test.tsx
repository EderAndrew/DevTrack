import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "@repo/contracts";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { expectTabOrder, tabTo } from "../../../test/keyboard";
import { SessionsList } from "./sessions-list";

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const session = (id: string, createdAt: string, current = false): SessionView => ({
  id,
  createdAt,
  lastUsedAt: createdAt,
  expiresAt: "2026-09-22T20:00:00.000Z",
  current,
});

const SESSIONS = [
  session("11111111-1111-4111-8111-111111111111", "2026-09-21T12:00:00.000Z", true),
  session("22222222-2222-4222-8222-222222222222", "2026-09-20T09:30:00.000Z"),
];

describe("SessionsList (US2-7, FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lista as sessões, marca a atual e não tem violações axe", async () => {
    const { container } = renderWithProviders(<SessionsList initialData={{ items: SESSIONS }} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(/esta sessão/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Encerrar sessão iniciada em 20\/09\/2026/ })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("encerrar outra sessão chama DELETE e remove a linha", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    renderWithProviders(<SessionsList initialData={{ items: SESSIONS }} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /20\/09\/2026/ }));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/me/sessions/${SESSIONS[1]!.id}`);
    expect(init?.method).toBe("DELETE");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(await screen.findByText(/encerrada\./)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("encerrar a sessão atual leva para /entrar", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    renderWithProviders(<SessionsList initialData={{ items: SESSIONS }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /esta sessão/ }));
    expect(router.replace).toHaveBeenCalledWith("/entrar");
  });

  it("sair de todos os dispositivos chama logout-all e leva para /entrar", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    renderWithProviders(<SessionsList initialData={{ items: SESSIONS }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Sair de todos os dispositivos" }));
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/auth/logout-all");
    expect(router.replace).toHaveBeenCalledWith("/entrar");
  });

  it("erro da API aparece no resumo", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ statusCode: 404, code: "NOT_FOUND", message: "Recurso não encontrado." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    renderWithProviders(<SessionsList initialData={{ items: SESSIONS }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /20\/09\/2026/ }));
    expect((await screen.findByRole("group")).textContent).toContain("Recurso não encontrado.");
  });
});

describe("SC-012 — acessibilidade e teclado (FR-075)", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const reply = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
    });
  const apiError = (status: number, code: string, message: string) => reply(status, { statusCode: status, code, message });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("encerrar sessão e sair de todos só com teclado; falha vai para o resumo com foco", async () => {
    const { container } = renderWithProviders(<SessionsList initialData={{ items: SESSIONS }} />);
    const user = userEvent.setup();
    const current = screen.getByRole("button", { name: /esta sessão/ });
    const other = screen.getByRole("button", { name: /Encerrar sessão iniciada em 20\/09\/2026/ });
    const all = screen.getByRole("button", { name: "Sair de todos os dispositivos" });
    await expectTabOrder(user, [current, other, all]);

    fetchMock.mockResolvedValueOnce(apiError(500, "INTERNAL_ERROR", "Erro inesperado."));
    await tabTo(user, other);
    await user.keyboard("{Enter}");
    const summary = await screen.findByRole("group", { name: "Não foi possível concluir" });
    expect(document.activeElement).toBe(summary);
    await expectNoA11yViolations(container);

    fetchMock.mockResolvedValueOnce(reply(204));
    await tabTo(user, other);
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));

    fetchMock.mockResolvedValueOnce(reply(204));
    await tabTo(user, all);
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
  });
});

describe("002/US4-1 revogar outra sessão atualiza a lista sem recarregar (FR-023)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    router.replace.mockReset();
    router.refresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a linha some, o cache da lista reflete a revogação e nada é recarregado", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { queryClient } = renderWithProviders(<SessionsList initialData={{ items: SESSIONS }} />);

    await userEvent.setup().click(screen.getByRole("button", { name: /20\/09\/2026/ }));

    await vi.waitFor(() => expect(screen.queryByRole("button", { name: /20\/09\/2026/ })).toBeNull());
    expect(screen.getByRole("button", { name: /esta sessão/ })).toBeTruthy();
    expect(queryClient.getQueryData<{ items: SessionView[] }>(["sessions", "list"])?.items.map((item) => item.id)).toEqual([
      SESSIONS[0]!.id,
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("encerrar a sessão atual descarta o cache antes de ir para /entrar (002/US4-4)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const { queryClient } = renderWithProviders(<SessionsList initialData={{ items: SESSIONS }} />);
    const order: string[] = [];
    vi.spyOn(queryClient, "clear").mockImplementation(() => void order.push("clear"));
    router.replace.mockImplementation(() => void order.push("navigate"));
    await userEvent.setup().click(screen.getByRole("button", { name: /esta sessão/ }));
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/entrar"));
    expect(order).toEqual(["clear", "navigate"]);
  });
});
