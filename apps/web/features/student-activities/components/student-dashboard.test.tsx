import type { MyClassView } from "@repo/contracts";
import { focusManager } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTENDANCE_POLL_MS } from "@/features/attendance/schemas/attendance";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { formatLongDateTime, formatLongDay } from "@/lib/messages/dates";
import { LOAD_ERROR, OFFLINE } from "./load-states";
import { DASHBOARD_SUBTITLE, EMPTY_DASHBOARD, StudentDashboard } from "./student-dashboard";
import { SUBJECT_SELECT_ID } from "./subject-switcher";
import { apiError, dashboard, json, POO_CLASS, routedFetch, SQL_CLASS, summary } from "./test-fixtures";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const POO = POO_CLASS;
const SQL = SQL_CLASS;
/** The Painel of one subject (026): the class of the "Matéria" card. */
const dashboardOf = (classId: string) => `GET /api/me/dashboard?classId=${classId}`;
const PATH = dashboardOf(POO.id);
const dashboardCalls = (calls: { url: string }[]) => calls.map((call) => call.url).filter((url) => url.startsWith("/api/me/dashboard"));

type Route = Parameters<typeof routedFetch>[0][string];

function setupWith(routes: Record<string, Route>, { classes = [POO], materia = null }: { classes?: MyClassView[]; materia?: string | null } = {}) {
  const api = routedFetch({ "GET /api/me/classes": json(200, { items: classes }), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<StudentDashboard materia={materia} />);
  return { ...view, api, user: userEvent.setup() };
}

const setup = (response: Route) => setupWith({ [PATH]: response });

describe("012/US2 painel do aluno", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("012/US2-1 012/SC-001 saudação, contadores como links e a próxima atividade com o prazo na primeira seção", async () => {
    const first = summary({ title: "Lista de herança", deadline: "2026-10-03T23:59:00.000Z" });
    const { container } = setup(json(200, dashboard({ next: [first, summary({ status: "IN_PROGRESS" })] })));
    expect(await screen.findByRole("heading", { level: 1, name: "Olá, Bruna" })).toBeTruthy();

    const counters = screen.getByRole("navigation", { name: "Resumo das suas atividades" });
    expect(within(counters).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Pendentes3Ainda não iniciadas", `/minhas-atividades?materia=${POO.id}&situacao=pendentes`],
      ["Em andamento2Iniciadas, sem entrega", `/minhas-atividades?materia=${POO.id}&situacao=em-andamento`],
      ["Atrasadas1Com o prazo vencido", `/minhas-atividades?materia=${POO.id}&situacao=atrasadas`],
      ["Concluídas8Entregues ou corrigidas", `/minhas-atividades?materia=${POO.id}&situacao=concluidas`],
    ]);

    // Substitute check for the 10 s of SC-001: the first section of the page is "Próximas
    // atividades" and its first card carries the title and the deadline (mobile width: T062).
    const firstSection = container.querySelector("section")!;
    expect(within(firstSection).getByRole("heading", { level: 2 }).textContent).toBe("Próximas atividades");
    const card = within(firstSection).getAllByRole("article")[0]!;
    expect(within(card).getByRole("heading", { name: "Lista de herança" })).toBeTruthy();
    expect(within(card).getByText(formatLongDateTime(first.deadline!))).toBeTruthy();
    expect(within(card).getByText("Pendente")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Iniciar" }).getAttribute("href")).toBe(`/minhas-atividades/${first.id}`);
  });

  it("012/US2-2 012/FR-011 urgência em texto e ícone; atrasada que aceita entrega na sua seção", async () => {
    const urgent = summary({ title: "Vence amanhã", urgent: true });
    const calm = summary({ title: "Vence semana que vem" });
    const overdue = summary({ title: "Atrasada aberta", status: "OVERDUE", urgent: true, latePolicy: "ACCEPT_MARKED" });
    setup(json(200, dashboard({ next: [urgent, calm], overdueOpen: [overdue] })));

    const urgentCard = (await screen.findByRole("heading", { name: "Vence amanhã" })).closest("article")!;
    const badge = within(urgentCard as HTMLElement).getByText("Vence em menos de 48 horas");
    expect(badge.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    const calmCard = screen.getByRole("heading", { name: "Vence semana que vem" }).closest("article")!;
    expect(within(calmCard as HTMLElement).queryByText(/48 horas/)).toBeNull();

    const late = screen.getByRole("region", { name: "Atrasadas — ainda aceitam entrega" });
    expect(within(late).getByText("Ainda aceita entrega com atraso")).toBeTruthy();
    expect(within(late).getByText("Atrasada")).toBeTruthy();
    expect(within(late).getByRole("link", { name: "Entregar com atraso" })).toBeTruthy();
  });

  it("012/US2-5 012/SC-010 vazio, erro e sem conexão são estados diferentes; tentar de novo recarrega", async () => {
    const empty = setup(json(200, dashboard({ counts: { pending: 0, inProgress: 0, overdue: 0, completed: 0 } })));
    expect(await screen.findByText(EMPTY_DASHBOARD)).toBeTruthy();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
    empty.unmount();

    let fail = true;
    const failing = setup(() => (fail ? apiError(500, "INTERNAL_ERROR", "Erro.") : json(200, dashboard())));
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
    expect(screen.queryByText(EMPTY_DASHBOARD)).toBeNull();
    fail = false;
    await failing.user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Olá, Bruna" })).toBeTruthy();
    failing.unmount();

    setup(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await screen.findByText(OFFLINE)).toBeTruthy();
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("012/US2-1 a ação segue a situação: Continuar, Ver entrega, Ver resultado", async () => {
    setup(
      json(
        200,
        dashboard({
          next: [summary({ title: "A", status: "IN_PROGRESS" }), summary({ title: "B", status: "PENDING", canAnswer: false })],
          overdueOpen: [],
        }),
      ),
    );
    const card = async (title: string) => (await screen.findByRole("heading", { name: title })).closest("article") as HTMLElement;
    expect(within(await card("A")).getByRole("link", { name: "Continuar" })).toBeTruthy();
    expect(within(await card("B")).getByRole("link", { name: "Ver atividade" })).toBeTruthy();
  });

  it("012/US2 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const item = summary({ title: "Lista de herança", urgent: true });
    const { container, user } = setup(json(200, dashboard({ next: [item] })));
    await screen.findByRole("heading", { name: "Lista de herança" });
    await expectNoA11yViolations(container);
    const counters = within(screen.getByRole("navigation", { name: "Resumo das suas atividades" })).getAllByRole("link");
    await expectTabOrder(user, [
      document.getElementById(SUBJECT_SELECT_ID)!,
      ...counters,
      screen.getByRole("link", { name: "Ver todas" }),
      screen.getByRole("link", { name: "Iniciar" }),
    ]);
  });

  it("013/US4-5 013/FR-021 um cartão de ranking por turma, depois das atividades, com o link para a tela completa", async () => {
    const poo = { id: "11111111-1111-4111-8111-111111111111", name: "POO Noturno" };
    const bd = { id: "22222222-2222-4222-8222-222222222222", name: "Banco de Dados" };
    const { container } = setup(
      json(
        200,
        dashboard({
          rankings: [
            { class: bd, top: [{ position: 1, name: "Bruna Costa", points: 60, isViewer: true }] },
            { class: poo, top: [{ position: 1, name: "Ana Lima", points: 105, isViewer: false }, { position: 2, name: "Bruna Costa", points: 30, isViewer: true }] },
          ],
        }),
      ),
    );
    const section = await screen.findByRole("region", { name: "Ranking das turmas" });
    expect(container.querySelector("section")!.textContent).toContain("Próximas atividades");
    const cards = within(section).getAllByRole("region");
    expect(cards.map((card) => card.getAttribute("aria-labelledby") && within(card).getByRole("heading").textContent)).toEqual([
      "Ranking — Banco de Dados",
      "Ranking — POO Noturno",
    ]);
    expect(within(cards[1]!).getByText("Ana Lima")).toBeTruthy();
    expect(within(cards[1]!).queryByText("60")).toBeNull();
    expect(within(section).getByRole("link", { name: "Ver ranking completo de POO Noturno" }).getAttribute("href")).toBe(`/minhas-turmas/${poo.id}/ranking`);
  });

  it("012/US2-1 o dia pelo relógio do servidor, o subtítulo e \"Ver todas\" levando à lista", async () => {
    const data = dashboard();
    setup(json(200, data));
    await screen.findByRole("heading", { level: 1, name: "Olá, Bruna" });
    expect(screen.getByText(formatLongDay(data.serverNow))).toBeTruthy();
    expect(screen.getByText(DASHBOARD_SUBTITLE)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver todas" }).getAttribute("href")).toBe(`/minhas-atividades?materia=${POO.id}`);
  });

  it("013/FR-021 \"Seu desempenho\" só com o aluno no top 5 enviado pelo servidor", async () => {
    const poo = { id: "11111111-1111-4111-8111-111111111111", name: "POO Noturno" };
    const bd = { id: "22222222-2222-4222-8222-222222222222", name: "Banco de Dados" };
    const first = setup(
      json(
        200,
        dashboard({
          rankings: [
            { class: poo, top: [{ position: 1, name: "Ana Lima", points: 105, isViewer: false }, { position: 4, name: "Bruna Costa", points: 45, isViewer: true }] },
            { class: bd, top: [{ position: 1, name: "Ana Lima", points: 60, isViewer: false }] },
          ],
        }),
      ),
    );
    const highlight = (await screen.findByRole("heading", { name: "Seu desempenho" })).parentElement!.parentElement!;
    expect(within(highlight).getByText("Você está em 4º lugar")).toBeTruthy();
    expect(within(highlight).getByText("POO Noturno · 45 pontos")).toBeTruthy();
    expect(within(highlight).queryByText(/Banco de Dados/)).toBeNull();
    first.unmount();

    setup(json(200, dashboard({ rankings: [{ class: bd, top: [{ position: 1, name: "Ana Lima", points: 60, isViewer: false }] }] })));
    await screen.findByRole("region", { name: "Ranking das turmas" });
    expect(screen.queryByRole("heading", { name: "Seu desempenho" })).toBeNull();
  });

  it("013/FR-021 sem rankings (sem a permissão ou sem turma ativa), nenhuma seção de ranking", async () => {
    setup(json(200, dashboard()));
    await screen.findByRole("heading", { level: 1, name: "Olá, Bruna" });
    expect(screen.queryByRole("region", { name: "Ranking das turmas" })).toBeNull();
  });
});

describe("026/US2 painel por matéria", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => vi.unstubAllGlobals());
  const subjectSelect = () => document.getElementById(SUBJECT_SELECT_ID) as HTMLSelectElement;
  const ranking = (schoolClass: MyClassView, isViewer: boolean) => ({
    class: { id: schoolClass.id, name: schoolClass.name },
    top: [
      { position: 1, name: "Ana Lima", points: 60, isViewer: false },
      ...(isViewer ? [{ position: 2, name: "Bruna Costa", points: 30, isViewer: true }] : []),
    ],
  });

  it("026/US2-1 o card no topo com a matéria mais recente, e o painel pedido é o dela", async () => {
    const { api, container } = setupWith(
      { [dashboardOf(POO.id)]: json(200, dashboard({ next: [summary({ title: "Trabalho de POO" })] })) },
      { classes: [POO, SQL] },
    );
    await screen.findByRole("heading", { name: "Trabalho de POO" });
    expect(subjectSelect().value).toBe(POO.id);
    expect(screen.getByLabelText("Matéria")).toBe(subjectSelect());
    const counters = screen.getByRole("navigation", { name: "Resumo das suas atividades" });
    expect(subjectSelect().compareDocumentPosition(counters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dashboardCalls(api.calls)).toEqual([`/api/me/dashboard?classId=${POO.id}`]);
    await expectNoA11yViolations(container);
  });

  it("026/US2-2 trocar no card leva a /painel?materia=<B>, e o painel pedido passa a ser o de B, com o card ainda focado", async () => {
    const { api, user, rerender } = setupWith(
      {
        [dashboardOf(POO.id)]: json(200, dashboard({ next: [summary({ title: "Trabalho de POO" })] })),
        [dashboardOf(SQL.id)]: json(200, dashboard({ next: [summary({ title: "Trabalho de SQL" })] })),
      },
      { classes: [POO, SQL] },
    );
    await screen.findByRole("heading", { name: "Trabalho de POO" });
    await user.selectOptions(subjectSelect(), "Banco de Dados · ADS 3NA");
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenLastCalledWith(`/painel?materia=${SQL.id}`);

    const select = subjectSelect();
    rerender(<StudentDashboard materia={SQL.id} />);
    expect(await screen.findByRole("heading", { name: "Trabalho de SQL" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Trabalho de POO" })).toBeNull();
    expect(subjectSelect()).toBe(select);
    expect(document.activeElement).toBe(select);
    expect(dashboardCalls(api.calls).at(-1)).toBe(`/api/me/dashboard?classId=${SQL.id}`);
  });

  it("026/US2-3 só o cartão de ranking da turma escolhida, e \"Seu desempenho\" só com o aluno no top 5 dela", async () => {
    const first = setupWith(
      { [dashboardOf(SQL.id)]: json(200, dashboard({ rankings: [ranking(SQL, true)] })) },
      { classes: [POO, SQL], materia: SQL.id },
    );
    const section = await screen.findByRole("region", { name: "Ranking das turmas" });
    expect(within(section).getAllByRole("region").map((card) => within(card).getByRole("heading").textContent)).toEqual([`Ranking — ${SQL.name}`]);
    expect(within(section).getByText("Você está em 2º lugar")).toBeTruthy();
    first.unmount();

    setupWith({ [dashboardOf(SQL.id)]: json(200, dashboard({ rankings: [ranking(SQL, false)] })) }, { classes: [POO, SQL], materia: SQL.id });
    await screen.findByRole("region", { name: "Ranking das turmas" });
    expect(screen.queryByRole("heading", { name: "Seu desempenho" })).toBeNull();
  });

  it("026/US2-4 os contadores e \"Ver todas\" levam a \"Minhas atividades\" da mesma matéria", async () => {
    setupWith({ [dashboardOf(SQL.id)]: json(200, dashboard()) }, { classes: [POO, SQL], materia: SQL.id });
    await screen.findByRole("heading", { level: 1, name: "Olá, Bruna" });
    const counters = within(screen.getByRole("navigation", { name: "Resumo das suas atividades" })).getAllByRole("link");
    expect(counters.map((link) => link.getAttribute("href"))).toEqual([
      `/minhas-atividades?materia=${SQL.id}&situacao=pendentes`,
      `/minhas-atividades?materia=${SQL.id}&situacao=em-andamento`,
      `/minhas-atividades?materia=${SQL.id}&situacao=atrasadas`,
      `/minhas-atividades?materia=${SQL.id}&situacao=concluidas`,
    ]);
    expect(screen.getByRole("link", { name: "Ver todas" }).getAttribute("href")).toBe(`/minhas-atividades?materia=${SQL.id}`);
  });

  it("026/FR-012 sem turma ativa: sem card, o painel de hoje sem classId e os links sem matéria", async () => {
    const { api } = setupWith({ "GET /api/me/dashboard": json(200, dashboard()) }, { classes: [] });
    await screen.findByRole("heading", { level: 1, name: "Olá, Bruna" });
    expect(document.getElementById(SUBJECT_SELECT_ID)).toBeNull();
    expect(dashboardCalls(api.calls)).toEqual(["/api/me/dashboard"]);
    expect(screen.getByRole("link", { name: "Ver todas" }).getAttribute("href")).toBe("/minhas-atividades");
  });

  describe("consulta periódica", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      focusManager.setFocused(true);
    });
    afterEach(() => {
      focusManager.setFocused(undefined);
      vi.useRealTimers();
    });

    it("026/FR-015 depois de trocar de matéria, a consulta de 5 s pede o painel de B e nunca mais o de A", async () => {
      const { api, rerender } = setupWith(
        { [dashboardOf(POO.id)]: json(200, dashboard()), [dashboardOf(SQL.id)]: json(200, dashboard()) },
        { classes: [POO, SQL] },
      );
      await vi.waitFor(() => expect(dashboardCalls(api.calls)).toEqual([`/api/me/dashboard?classId=${POO.id}`]));
      rerender(<StudentDashboard materia={SQL.id} />);
      await vi.waitFor(() => expect(dashboardCalls(api.calls).at(-1)).toBe(`/api/me/dashboard?classId=${SQL.id}`));
      const switched = dashboardCalls(api.calls).length;

      await act(() => vi.advanceTimersByTimeAsync(2 * ATTENDANCE_POLL_MS));
      const after = dashboardCalls(api.calls).slice(switched);
      expect(after.length).toBeGreaterThanOrEqual(2);
      expect(after.every((url) => url === `/api/me/dashboard?classId=${SQL.id}`)).toBe(true);
    });
  });
});

describe("026/US3 painel só com as matérias do próprio aluno", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => vi.unstubAllGlobals());
  const subjectSelect = () => document.getElementById(SUBJECT_SELECT_ID) as HTMLSelectElement;
  const GONE = "99999999-9999-4999-8999-999999999999";
  const pooDashboard = { [dashboardOf(POO.id)]: json(200, dashboard({ next: [summary({ title: "Trabalho de POO" })] })) };

  it("026/US3-1 as opções do card são só as de \"Minhas turmas\", na ordem dela", async () => {
    setupWith(pooDashboard, { classes: [POO, SQL] });
    await screen.findByRole("heading", { name: "Trabalho de POO" });
    expect(within(subjectSelect()).getAllByRole("option").map((option) => (option as HTMLOptionElement).value)).toEqual([POO.id, SQL.id]);
  });

  it("026/US3-3 matéria fora da lista: o aviso e a primeira matéria, sem pedir a turma do endereço", async () => {
    const { api } = setupWith(pooDashboard, { classes: [POO, SQL], materia: GONE });
    await screen.findByRole("heading", { name: "Trabalho de POO" });
    expect(screen.getByText("Essa matéria não está mais disponível para você.")).toBeTruthy();
    expect(subjectSelect().value).toBe(POO.id);
    expect(dashboardCalls(api.calls)).toEqual([`/api/me/dashboard?classId=${POO.id}`]);
    expect(api.calls.some((call) => call.url.includes(GONE))).toBe(false);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("026/US3-4 sem turmas: nenhum card e o painel vazio de hoje", async () => {
    setupWith({ "GET /api/me/dashboard": json(200, dashboard({ next: [], overdueOpen: [] })) }, { classes: [] });
    expect(await screen.findByText(EMPTY_DASHBOARD)).toBeTruthy();
    expect(document.getElementById(SUBJECT_SELECT_ID)).toBeNull();
    expect(screen.queryByText("Essa matéria não está mais disponível para você.")).toBeNull();
  });

  it("026/US3-6 o painel responde 404 para a matéria escolhida: \"Minhas turmas\" é pedida de novo e, sem ela, o aviso e a primeira matéria", async () => {
    let classesCalls = 0;
    const { api } = setupWith(
      {
        "GET /api/me/classes": () => json(200, { items: ++classesCalls === 1 ? [POO, SQL] : [POO] }),
        [dashboardOf(SQL.id)]: apiError(404, "NOT_FOUND", "Não encontrado."),
        ...pooDashboard,
      },
      { classes: [POO, SQL], materia: SQL.id },
    );
    expect(await screen.findByRole("heading", { name: "Trabalho de POO" })).toBeTruthy();
    expect(screen.getByText("Essa matéria não está mais disponível para você.")).toBeTruthy();
    expect(subjectSelect().value).toBe(POO.id);
    expect(classesCalls).toBe(2);
    expect(dashboardCalls(api.calls)).toEqual([`/api/me/dashboard?classId=${SQL.id}`, `/api/me/dashboard?classId=${POO.id}`]);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
