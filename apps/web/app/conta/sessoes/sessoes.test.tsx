import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionView } from "../../../lib/auth-api";
import { expectNoA11yViolations } from "../../../test/a11y";
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
    const { container } = render(<SessionsList initialSessions={SESSIONS} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText(/esta sessão/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Encerrar sessão iniciada em 20\/09\/2026/ })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("encerrar outra sessão chama DELETE e remove a linha", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<SessionsList initialSessions={SESSIONS} />);

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
    render(<SessionsList initialSessions={SESSIONS} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /esta sessão/ }));
    expect(router.replace).toHaveBeenCalledWith("/entrar");
  });

  it("sair de todos os dispositivos chama logout-all e leva para /entrar", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    render(<SessionsList initialSessions={SESSIONS} />);
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
    render(<SessionsList initialSessions={SESSIONS} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /20\/09\/2026/ }));
    expect((await screen.findByRole("group")).textContent).toContain("Recurso não encontrado.");
  });
});
