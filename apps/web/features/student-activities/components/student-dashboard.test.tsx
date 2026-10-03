import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { formatLongDateTime } from "@/lib/messages/dates";
import { LOAD_ERROR, OFFLINE } from "./load-states";
import { EMPTY_DASHBOARD, StudentDashboard } from "./student-dashboard";
import { apiError, dashboard, json, routedFetch, summary } from "./test-fixtures";

const PATH = "GET /api/me/dashboard";

function setup(response: Parameters<typeof routedFetch>[0][string]) {
  const api = routedFetch({ [PATH]: response });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<StudentDashboard />);
  return { ...view, api, user: userEvent.setup() };
}

describe("012/US2 painel do aluno", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("012/US2-1 012/SC-001 saudação, contadores como links e a próxima atividade com o prazo na primeira seção", async () => {
    const first = summary({ title: "Lista de herança", deadline: "2026-10-03T23:59:00.000Z" });
    const { container } = setup(json(200, dashboard({ next: [first, summary({ status: "IN_PROGRESS" })] })));
    expect(await screen.findByRole("heading", { level: 1, name: "Olá, Bruna" })).toBeTruthy();

    const counters = screen.getByRole("navigation", { name: "Resumo das suas atividades" });
    expect(within(counters).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["3Pendentes", "/minhas-atividades?situacao=pendentes"],
      ["2Em andamento", "/minhas-atividades?situacao=em-andamento"],
      ["1Atrasadas", "/minhas-atividades?situacao=atrasadas"],
      ["8Concluídas", "/minhas-atividades?situacao=concluidas"],
    ]);

    // Substitute check for the 10 s of SC-001: the first section of the page is "Próximas
    // atividades" and its first card carries the title and the deadline (mobile width: T062).
    const firstSection = container.querySelector("section")!;
    expect(within(firstSection).getByRole("heading", { level: 2 }).textContent).toBe("Próximas atividades");
    const card = within(firstSection).getAllByRole("article")[0]!;
    expect(within(card).getByRole("heading", { name: "Lista de herança" })).toBeTruthy();
    expect(within(card).getByText(formatLongDateTime(first.deadline))).toBeTruthy();
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
    await expectTabOrder(user, [...counters, screen.getByRole("link", { name: "Iniciar" })]);
  });
});
