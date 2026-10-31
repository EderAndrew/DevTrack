import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { formatLongDateTime } from "@/lib/messages/dates";
import type { StudentActivityListFilters } from "../api/student-activities";
import { filtersFromSearch } from "../schemas/student-activity";
import { LOAD_ERROR } from "./load-states";
import { FILTER_IDS, MyActivities } from "./my-activities";
import { apiError, json, routedFetch, summary } from "./test-fixtures";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NONE: StudentActivityListFilters = { status: null, type: null };

function setup(routes: Parameters<typeof routedFetch>[0], filters = NONE) {
  const api = routedFetch(routes);
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<MyActivities filters={filters} />);
  return { ...view, api, user: userEvent.setup() };
}

describe("012/US2 Minhas atividades", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("012/US2-4 012/FR-012 cada item: título, resumo, tipo, turma/disciplina, professor, publicação, prazo, situação, nota e feedback", async () => {
    const graded = summary({
      title: "Trabalho de interfaces",
      type: "ASSIGNMENT",
      status: "GRADED",
      late: true,
      canAnswer: false,
      submittedAt: "2026-10-04T10:00:00.000Z",
      result: { grade: "0.90", hasFeedback: true },
    });
    setup({ "GET /api/me/activities": json(200, { items: [graded], nextCursor: null }) });
    const card = (await screen.findByRole("heading", { name: "Trabalho de interfaces" })).closest("article") as HTMLElement;
    for (const text of [
      "Resolva os exercícios de herança.",
      "Trabalho",
      "POO Noturno · Programação Orientada a Objetos",
      "Ana Professora",
      formatLongDateTime(graded.publishedAt),
      formatLongDateTime(graded.deadline!),
      "Corrigida com atraso",
      "0,90 de 1,00",
      "Com feedback",
    ]) {
      expect(within(card).getByText(text)).toBeTruthy();
    }
    expect(within(card).getByRole("link", { name: "Ver resultado" })).toBeTruthy();
  });

  it("012/US2-4 filtros na URL: Atrasadas + Trabalho pede à API status e tipo", async () => {
    const { user, api } = setup(
      {
        "GET /api/me/activities?status=OVERDUE&type=ASSIGNMENT": json(200, {
          items: [summary({ title: "Atrasado", type: "ASSIGNMENT", status: "OVERDUE", canAnswer: false })],
          nextCursor: null,
        }),
      },
      { status: "OVERDUE", type: "ASSIGNMENT" },
    );
    expect(await screen.findByRole("heading", { name: "Atrasado" })).toBeTruthy();
    expect(api.calls.map((call) => call.url)).toEqual(["/api/me/activities?status=OVERDUE&type=ASSIGNMENT"]);
    expect((screen.getByLabelText("Situação") as HTMLSelectElement).value).toBe("OVERDUE");

    await user.selectOptions(screen.getByLabelText("Tipo"), "Todos");
    expect(router.replace).toHaveBeenLastCalledWith("/minhas-atividades?situacao=atrasadas");
    await user.selectOptions(screen.getByLabelText("Situação"), "Entregues/concluídas");
    expect(router.replace).toHaveBeenLastCalledWith("/minhas-atividades?situacao=concluidas&tipo=trabalho");

    expect(filtersFromSearch({ situacao: "atrasadas", tipo: "trabalho" })).toEqual({ status: "OVERDUE", type: "ASSIGNMENT" });
    expect(filtersFromSearch({ situacao: "qualquer", tipo: "EXAM" })).toEqual(NONE);
  });

  it("012/FR-012 \"Carregar mais\" pede a página seguinte pelo cursor e junta os itens", async () => {
    const { user } = setup({
      "GET /api/me/activities": json(200, { items: [summary({ title: "Primeira" })], nextCursor: "c1" }),
      "GET /api/me/activities?cursor=c1": json(200, { items: [summary({ title: "Segunda" })], nextCursor: null }),
    });
    await screen.findByRole("heading", { name: "Primeira" });
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("heading", { name: "Segunda" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Primeira" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("012/SC-010 lista vazia e falha são mensagens diferentes", async () => {
    const empty = setup({ "GET /api/me/activities": json(200, { items: [], nextCursor: null }) });
    expect(await screen.findByText("Você ainda não tem atividades.")).toBeTruthy();
    empty.unmount();
    setup({ "GET /api/me/activities?status=PENDING": json(200, { items: [], nextCursor: null }) }, { status: "PENDING", type: null });
    expect(await screen.findByText("Nenhuma atividade com esses filtros.")).toBeTruthy();
    vi.unstubAllGlobals();
    setup({ "GET /api/me/activities": apiError(500, "INTERNAL_ERROR", "Erro.") });
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
  });

  it("012/US2 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { container, user } = setup({ "GET /api/me/activities": json(200, { items: [summary({ title: "Única" })], nextCursor: "c1" }) });
    await screen.findByRole("heading", { name: "Única" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      document.getElementById(FILTER_IDS.status)!,
      document.getElementById(FILTER_IDS.type)!,
      screen.getByRole("link", { name: "Iniciar" }),
      screen.getByRole("button", { name: "Carregar mais" }),
    ]);
  });
});

describe("013/US2 Minhas atividades — Exercício com pontos", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("013/FR-015 Exercício: \"Sem prazo\", \"Pontos: 45 de 105\" com aguardando correção, sem nota; ação Ver resultado", async () => {
    const practice = summary({
      title: "Prática de herança",
      type: "EXERCISE",
      deadline: null,
      latePolicy: null,
      totalGrade: null,
      status: "COMPLETED",
      points: { possible: 105, earned: 45, awaitingCorrection: true },
    });
    const { container } = setup({ "GET /api/me/activities": json(200, { items: [practice], nextCursor: null }) });
    const card = (await screen.findByRole("heading", { name: "Prática de herança" })).closest("article") as HTMLElement;
    expect(within(card).getByText("Sem prazo")).toBeTruthy();
    expect(within(card).getByText("45 de 105 · Aguardando correção")).toBeTruthy();
    expect(within(card).getByText("Concluída")).toBeTruthy();
    expect(within(card).queryByText("Nota")).toBeNull();
    expect(within(card).getByRole("link", { name: "Ver resultado" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});

describe("Minhas atividades — a nota maior à direita do card", () => {
  afterEach(() => vi.unstubAllGlobals());
  const cardOf = async (title: string) => (await screen.findByRole("heading", { name: title })).closest("article") as HTMLElement;
  const scoreOf = (card: HTMLElement) => card.querySelector('div[aria-hidden="true"]')?.textContent;

  it("012/FR-012 a nota liberada aparece maior e continua abaixo de Situação; sem liberação, nada", async () => {
    const graded = summary({ title: "Corrigido", status: "GRADED", totalGrade: "0.75", result: { grade: "0.40", hasFeedback: false } });
    const waiting = summary({ id: "bbbbbbbb-0000-4000-8000-000000000081", title: "Entregue", status: "SUBMITTED", totalGrade: "0.75", result: null });
    setup({ "GET /api/me/activities": json(200, { items: [graded, waiting], nextCursor: null }) });
    const card = await cardOf("Corrigido");
    expect(scoreOf(card)).toBe("0,40Nota");
    expect(within(card).getByText("0,40 de 0,75")).toBeTruthy();
    expect(scoreOf(await cardOf("Entregue"))).toBeUndefined();
  });

  it("013/FR-015 Exercício: pontos, nunca nota; parciais até concluir e corrigir", async () => {
    const exercise = { type: "EXERCISE" as const, deadline: null, latePolicy: null, totalGrade: null };
    const open = summary({ ...exercise, title: "Aberto", status: "IN_PROGRESS", points: { possible: 105, earned: 0, awaitingCorrection: false } });
    const awaiting = summary({ ...exercise, id: "bbbbbbbb-0000-4000-8000-000000000082", title: "Corrigindo", status: "COMPLETED", points: { possible: 105, earned: 45, awaitingCorrection: true } });
    const done = summary({ ...exercise, id: "bbbbbbbb-0000-4000-8000-000000000083", title: "Pronto", status: "COMPLETED", points: { possible: 105, earned: 60, awaitingCorrection: false } });
    setup({ "GET /api/me/activities": json(200, { items: [open, awaiting, done], nextCursor: null }) });
    expect(scoreOf(await cardOf("Aberto"))).toBe("0Pontos parciais");
    expect(scoreOf(await cardOf("Corrigindo"))).toBe("45Pontos parciais");
    expect(scoreOf(await cardOf("Pronto"))).toBe("60Pontos");
  });
});

describe("023/US3 Minhas atividades num trabalho em grupo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("023/US3-3 o trabalho em grupo mostra \"Em grupo\" com a situação da tentativa do grupo; o individual, não", async () => {
    const group = summary({ id: "bbbbbbbb-0000-4000-8000-000000000071", title: "Trabalho em grupo", type: "ASSIGNMENT", status: "IN_PROGRESS", groupSize: 3 });
    const alone = summary({ id: "bbbbbbbb-0000-4000-8000-000000000072", title: "Trabalho individual", type: "ASSIGNMENT", status: "IN_PROGRESS" });
    setup({ "GET /api/me/activities": json(200, { items: [group, alone], nextCursor: null }) });
    const groupCard = (await screen.findByRole("heading", { name: "Trabalho em grupo" })).closest("article") as HTMLElement;
    expect(within(groupCard).getByText("Em grupo")).toBeTruthy();
    expect(within(groupCard).getByText("Em andamento")).toBeTruthy();
    const aloneCard = screen.getByRole("heading", { name: "Trabalho individual" }).closest("article") as HTMLElement;
    expect(within(aloneCard).queryByText("Em grupo")).toBeNull();
  });
});
