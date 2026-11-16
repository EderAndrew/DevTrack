import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import type { MyClassView } from "@repo/contracts";
import { renderWithProviders } from "../../../test/render";
import { formatLongDateTime } from "@/lib/messages/dates";
import type { StudentActivityListFilters } from "../api/student-activities";
import { filtersFromSearch, myActivitiesHref } from "../schemas/student-activity";
import { LOAD_ERROR } from "./load-states";
import { FILTER_IDS, MyActivities, NO_GRADE_YET, shownLabel } from "./my-activities";
import { SUBJECT_SELECT_ID } from "./subject-switcher";
import { apiError, json, routedFetch, summary } from "./test-fixtures";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NONE: StudentActivityListFilters = { status: null, type: null };

const myClass = (overrides: Partial<MyClassView>): MyClassView => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "ADS 3NA",
  code: "ADS-3NA",
  academicYear: 2026,
  period: "2026.2",
  teacherName: "Ana Professora",
  subjectName: "Programação Orientada a Objetos",
  enrolledAt: "2026-11-10T12:00:00.000Z",
  ...overrides,
});
/** "Minhas turmas" lists the most recent enrollment first (026 research D6). */
const POO = myClass({});
const SQL = myClass({ id: "22222222-2222-4222-8222-222222222222", subjectName: "Banco de Dados", enrolledAt: "2026-11-01T12:00:00.000Z" });

/** The list of one subject: `classId` first, then the 012 filters and the cursor. */
const listOf = (classId: string, query = "") => `GET /api/me/activities?classId=${classId}${query ? `&${query}` : ""}`;
const listRoute = (query = "") => listOf(POO.id, query);
const activityCalls = (calls: { url: string }[]) => calls.map((call) => call.url).filter((url) => url.startsWith("/api/me/activities"));

function setup(
  routes: Parameters<typeof routedFetch>[0],
  filters = NONE,
  { classes = [POO], materia = null }: { classes?: MyClassView[]; materia?: string | null } = {},
) {
  const api = routedFetch({ "GET /api/me/classes": json(200, { items: classes }), ...routes });
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<MyActivities filters={filters} materia={materia} />);
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
    setup({ [listRoute()]: json(200, { items: [graded], nextCursor: null }) });
    const card = (await screen.findByRole("heading", { name: "Trabalho de interfaces" })).closest("article") as HTMLElement;
    for (const text of [
      "Resolva os exercícios de herança.",
      "Trabalho",
      "POO Noturno · Programação Orientada a Objetos",
      "Ana Professora",
      formatLongDateTime(graded.publishedAt),
      formatLongDateTime(graded.deadline!),
      "Corrigida com atraso",
      "0,90",
      "de 1,00",
      "Com feedback",
    ]) {
      expect(within(card).getByText(text)).toBeTruthy();
    }
    expect(within(card).getByRole("link", { name: "Ver resultado" })).toBeTruthy();
  });

  it("012/US2-4 filtros na URL: Atrasadas + Trabalho pede à API status e tipo", async () => {
    const { user, api } = setup(
      {
        [listRoute("status=OVERDUE&type=ASSIGNMENT")]: json(200, {
          items: [summary({ title: "Atrasado", type: "ASSIGNMENT", status: "OVERDUE", canAnswer: false })],
          nextCursor: null,
        }),
      },
      { status: "OVERDUE", type: "ASSIGNMENT" },
    );
    expect(await screen.findByRole("heading", { name: "Atrasado" })).toBeTruthy();
    expect(activityCalls(api.calls)).toEqual([`/api/me/activities?classId=${POO.id}&status=OVERDUE&type=ASSIGNMENT`]);
    expect((screen.getByLabelText("Situação") as HTMLSelectElement).value).toBe("OVERDUE");

    await user.selectOptions(screen.getByLabelText("Tipo"), "Todos");
    expect(router.replace).toHaveBeenLastCalledWith(`/minhas-atividades?materia=${POO.id}&situacao=atrasadas`);
    await user.selectOptions(screen.getByLabelText("Situação"), "Entregues/concluídas");
    expect(router.replace).toHaveBeenLastCalledWith(`/minhas-atividades?materia=${POO.id}&situacao=concluidas&tipo=trabalho`);

    expect(filtersFromSearch({ situacao: "atrasadas", tipo: "trabalho" })).toEqual({ status: "OVERDUE", type: "ASSIGNMENT" });
    expect(filtersFromSearch({ situacao: "qualquer", tipo: "EXAM" })).toEqual(NONE);
  });

  it("012/FR-012 \"Carregar mais\" pede a página seguinte pelo cursor e junta os itens", async () => {
    const { user } = setup({
      [listRoute()]: json(200, { items: [summary({ title: "Primeira" })], nextCursor: "c1" }),
      [listRoute("cursor=c1")]: json(200, { items: [summary({ title: "Segunda" })], nextCursor: null }),
    });
    await screen.findByRole("heading", { name: "Primeira" });
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("heading", { name: "Segunda" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Primeira" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("012/US2-4 \"Limpar filtros\" só com filtro ativo, e a contagem diz quantas estão exibidas", async () => {
    const { user } = setup(
      { [listRoute("status=PENDING")]: json(200, { items: [summary({ title: "Uma" }), summary({ title: "Outra" })], nextCursor: "c1" }) },
      { status: "PENDING", type: null },
    );
    await screen.findByRole("heading", { name: "Uma" });
    expect(screen.getByText(shownLabel(2))).toBeTruthy();
    expect(screen.getByText(/há mais para carregar/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(router.replace).toHaveBeenLastCalledWith(`/minhas-atividades?materia=${POO.id}`);
  });

  it("012/US2-4 sem filtro, nenhum \"Limpar filtros\"; uma só atividade no singular", async () => {
    setup({ [listRoute()]: json(200, { items: [summary({ title: "Sozinha" })], nextCursor: null }) });
    await screen.findByRole("heading", { name: "Sozinha" });
    expect(screen.queryByRole("button", { name: "Limpar filtros" })).toBeNull();
    expect(screen.getByText("Exibindo 1 atividade")).toBeTruthy();
    expect(screen.queryByText(/há mais para carregar/)).toBeNull();
  });

  it("012/FR-012 resumo das exibidas: corrigidas, pontuação obtida e aproveitamento, só com notas liberadas", async () => {
    const items = [
      summary({ title: "AC2", status: "GRADED", canAnswer: false, totalGrade: "0.75", result: { grade: "0.60", hasFeedback: false } }),
      summary({ title: "AC4", status: "GRADED", canAnswer: false, totalGrade: "0.25", result: { grade: "0.25", hasFeedback: false } }),
      summary({ title: "Entregue", status: "SUBMITTED", canAnswer: false, totalGrade: "1.00", result: null }),
      summary({ title: "Prática", type: "EXERCISE", deadline: null, latePolicy: null, totalGrade: null, status: "COMPLETED", points: { possible: 105, earned: 60, awaitingCorrection: false } }),
    ];
    const { container } = setup({ [listRoute()]: json(200, { items, nextCursor: null }) });
    const region = await screen.findByRole("region", { name: "Resumo das atividades exibidas" });
    const cards = within(region).getAllByRole("listitem").map((card) => card.textContent);
    expect(cards).toEqual([
      "Atividades corrigidas2com nota liberada, nas atividades exibidas",
      "Pontuação obtida0,85de 1,00 possíveis nas corrigidas",
      "Aproveitamento85%nas atividades exibidas",
    ]);
    await expectNoA11yViolations(container);
  });

  it("012/FR-012 sem nota liberada nas exibidas: os cartões dizem isso, sem percentual", async () => {
    setup({ [listRoute()]: json(200, { items: [summary({ title: "Aberta" })], nextCursor: null }) });
    const region = await screen.findByRole("region", { name: "Resumo das atividades exibidas" });
    expect(within(region).getAllByText(NO_GRADE_YET)).toHaveLength(2);
    expect(within(region).queryByText(/%/)).toBeNull();
  });

  it("012/SC-010 lista vazia e falha são mensagens diferentes", async () => {
    const empty = setup({ [listRoute()]: json(200, { items: [], nextCursor: null }) });
    expect(await screen.findByText("Você ainda não tem atividades.")).toBeTruthy();
    empty.unmount();
    setup({ [listRoute("status=PENDING")]: json(200, { items: [], nextCursor: null }) }, { status: "PENDING", type: null });
    expect(await screen.findByText("Nenhuma atividade com esses filtros.")).toBeTruthy();
    vi.unstubAllGlobals();
    setup({ [listRoute()]: apiError(500, "INTERNAL_ERROR", "Erro.") });
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
  });

  it("012/US2 SC-012 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { container, user } = setup({ [listRoute()]: json(200, { items: [summary({ title: "Única" })], nextCursor: "c1" }) });
    await screen.findByRole("heading", { name: "Única" });
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      document.getElementById(SUBJECT_SELECT_ID)!,
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
    const { container } = setup({ [listRoute()]: json(200, { items: [practice], nextCursor: null }) });
    const card = (await screen.findByRole("heading", { name: "Prática de herança" })).closest("article") as HTMLElement;
    expect(within(card).getByText("Sem prazo")).toBeTruthy();
    expect(within(card).getByText("de 105")).toBeTruthy();
    expect(within(card).getByText("Aguardando correção")).toBeTruthy();
    expect(within(card).getByText("Concluída")).toBeTruthy();
    expect(within(card).queryByText("Nota")).toBeNull();
    expect(within(card).getByRole("link", { name: "Ver resultado" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});

describe("Minhas atividades — a nota maior à direita do card", () => {
  afterEach(() => vi.unstubAllGlobals());
  const cardOf = async (title: string) => (await screen.findByRole("heading", { name: title })).closest("article") as HTMLElement;
  const scoreOf = (card: HTMLElement) => card.querySelector('[data-slot="activity-score"]')?.textContent;

  it("012/FR-012 a nota liberada aparece maior e continua abaixo de Situação; sem liberação, nada", async () => {
    const graded = summary({ title: "Corrigido", status: "GRADED", totalGrade: "0.75", result: { grade: "0.40", hasFeedback: false } });
    const waiting = summary({ id: "bbbbbbbb-0000-4000-8000-000000000081", title: "Entregue", status: "SUBMITTED", totalGrade: "0.75", result: null });
    setup({ [listRoute()]: json(200, { items: [graded, waiting], nextCursor: null }) });
    const card = await cardOf("Corrigido");
    // 0,40 of 0,75 in whole hundredths: 40 × 100 / 75 = 53,3… → 53%.
    expect(scoreOf(card)).toBe("Nota obtida0,40de 0,7553% da nota máxima");
    expect(within(card).getByRole("progressbar", { name: "Nota obtida: 53% da nota máxima" })).toBeTruthy();
    const waitingScore = scoreOf(await cardOf("Entregue"));
    expect(waitingScore).toBe("Nota máxima0,75A nota aparece quando o professor liberar o resultado.");
    expect(waitingScore).not.toContain("Nota obtida");
  });

  it("013/FR-015 Exercício: pontos, nunca nota; parciais até concluir e corrigir", async () => {
    const exercise = { type: "EXERCISE" as const, deadline: null, latePolicy: null, totalGrade: null };
    const open = summary({ ...exercise, title: "Aberto", status: "IN_PROGRESS", points: { possible: 105, earned: 0, awaitingCorrection: false } });
    const awaiting = summary({ ...exercise, id: "bbbbbbbb-0000-4000-8000-000000000082", title: "Corrigindo", status: "COMPLETED", points: { possible: 105, earned: 45, awaitingCorrection: true } });
    const done = summary({ ...exercise, id: "bbbbbbbb-0000-4000-8000-000000000083", title: "Pronto", status: "COMPLETED", points: { possible: 105, earned: 60, awaitingCorrection: false } });
    setup({ [listRoute()]: json(200, { items: [open, awaiting, done], nextCursor: null }) });
    expect(scoreOf(await cardOf("Aberto"))).toBe("Pontos parciais0de 105");
    expect(scoreOf(await cardOf("Corrigindo"))).toBe("Pontos parciais45de 105Aguardando correção");
    expect(scoreOf(await cardOf("Pronto"))).toBe("Pontos60de 105");
    for (const title of ["Aberto", "Corrigindo", "Pronto"]) expect(scoreOf(await cardOf(title))).not.toMatch(/Nota/);
  });
});

describe("023/US3 Minhas atividades num trabalho em grupo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("023/US3-3 o trabalho em grupo mostra \"Em grupo\" com a situação da tentativa do grupo; o individual, não", async () => {
    const group = summary({ id: "bbbbbbbb-0000-4000-8000-000000000071", title: "Trabalho em grupo", type: "ASSIGNMENT", status: "IN_PROGRESS", groupSize: 3 });
    const alone = summary({ id: "bbbbbbbb-0000-4000-8000-000000000072", title: "Trabalho individual", type: "ASSIGNMENT", status: "IN_PROGRESS" });
    setup({ [listRoute()]: json(200, { items: [group, alone], nextCursor: null }) });
    const groupCard = (await screen.findByRole("heading", { name: "Trabalho em grupo" })).closest("article") as HTMLElement;
    expect(within(groupCard).getByText("Em grupo")).toBeTruthy();
    expect(within(groupCard).getByText("Em andamento")).toBeTruthy();
    const aloneCard = screen.getByRole("heading", { name: "Trabalho individual" }).closest("article") as HTMLElement;
    expect(within(aloneCard).queryByText("Em grupo")).toBeNull();
  });
});

describe("026/US1 Minhas atividades de uma matéria", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => vi.unstubAllGlobals());
  const subjectSelect = () => document.getElementById(SUBJECT_SELECT_ID) as HTMLSelectElement;

  it("026/US1-1 sem matéria no endereço: o card mostra a matrícula mais recente e a lista é só dela", async () => {
    const { api } = setup(
      { [listRoute()]: json(200, { items: [summary({ title: "Trabalho de POO" })], nextCursor: null }) },
      NONE,
      { classes: [POO, SQL] },
    );
    await screen.findByRole("heading", { name: "Trabalho de POO" });
    expect(screen.getByLabelText("Matéria")).toBe(subjectSelect());
    expect(subjectSelect().value).toBe(POO.id);
    expect(within(subjectSelect()).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Programação Orientada a Objetos · ADS 3NA",
      "Banco de Dados · ADS 3NA",
    ]);
    expect(activityCalls(api.calls)).toEqual([`/api/me/activities?classId=${POO.id}`]);
  });

  it("026/US1-2 026/SC-003 escolher outra matéria no card troca o endereço, mantendo situação e tipo, e a lista passa a ser a dela", async () => {
    const pending = { status: "PENDING", type: "ASSIGNMENT" } as const;
    const { api, user, rerender } = setup(
      {
        [listRoute("status=PENDING&type=ASSIGNMENT")]: json(200, { items: [summary({ title: "Trabalho de POO" })], nextCursor: null }),
        [listOf(SQL.id, "status=PENDING&type=ASSIGNMENT")]: json(200, { items: [summary({ title: "Trabalho de SQL" })], nextCursor: null }),
      },
      pending,
      { classes: [POO, SQL] },
    );
    await screen.findByRole("heading", { name: "Trabalho de POO" });
    await user.selectOptions(subjectSelect(), "Banco de Dados · ADS 3NA");
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenLastCalledWith(`/minhas-atividades?materia=${SQL.id}&situacao=pendentes&tipo=trabalho`);

    rerender(<MyActivities filters={pending} materia={SQL.id} />);
    expect(await screen.findByRole("heading", { name: "Trabalho de SQL" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Trabalho de POO" })).toBeNull();
    expect(subjectSelect().value).toBe(SQL.id);
    expect(activityCalls(api.calls).at(-1)).toBe(`/api/me/activities?classId=${SQL.id}&status=PENDING&type=ASSIGNMENT`);
  });

  it("026/US1-3 \"Limpar filtros\" tira situação e tipo e mantém a matéria", async () => {
    const { user } = setup(
      { [listOf(SQL.id, "status=OVERDUE")]: json(200, { items: [summary({ title: "Atrasado" })], nextCursor: null }) },
      { status: "OVERDUE", type: null },
      { classes: [POO, SQL], materia: SQL.id },
    );
    await screen.findByRole("heading", { name: "Atrasado" });
    await user.click(screen.getByRole("button", { name: "Limpar filtros" }));
    expect(router.replace).toHaveBeenLastCalledWith(`/minhas-atividades?materia=${SQL.id}`);
  });

  it("026/US1-4 matéria sem atividades: o estado vazio de hoje, com o card", async () => {
    setup({ [listOf(SQL.id)]: json(200, { items: [], nextCursor: null }) }, NONE, { classes: [POO, SQL], materia: SQL.id });
    expect(await screen.findByText("Você ainda não tem atividades.")).toBeTruthy();
    expect(subjectSelect().value).toBe(SQL.id);
  });

  it("026/US1-5 \"Carregar mais\" pede a página seguinte da mesma matéria", async () => {
    const { api, user } = setup({
      [listRoute()]: json(200, { items: [summary({ title: "Primeira" })], nextCursor: "c1" }),
      [listRoute("cursor=c1")]: json(200, { items: [summary({ title: "Segunda" })], nextCursor: null }),
    });
    await screen.findByRole("heading", { name: "Primeira" });
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("heading", { name: "Segunda" })).toBeTruthy();
    expect(activityCalls(api.calls)).toEqual([`/api/me/activities?classId=${POO.id}`, `/api/me/activities?classId=${POO.id}&cursor=c1`]);
  });

  it("026/FR-015 depois de trocar de matéria, a consulta periódica pede a nova matéria", async () => {
    const { api, rerender, queryClient } = setup(
      {
        [listRoute()]: json(200, { items: [summary({ title: "Trabalho de POO" })], nextCursor: null }),
        [listOf(SQL.id)]: json(200, { items: [summary({ title: "Trabalho de SQL" })], nextCursor: null }),
      },
      NONE,
      { classes: [POO, SQL] },
    );
    await screen.findByRole("heading", { name: "Trabalho de POO" });
    rerender(<MyActivities filters={NONE} materia={SQL.id} />);
    await screen.findByRole("heading", { name: "Trabalho de SQL" });
    const before = activityCalls(api.calls).length;
    // The 5 s poll refetches the active query only (refetchInterval belongs to the mounted observer).
    await queryClient.refetchQueries({ queryKey: ["student-activities"], type: "active" });
    expect(activityCalls(api.calls).slice(before)).toEqual([`/api/me/activities?classId=${SQL.id}`]);
  });

  it("026/FR-012 sem turma ativa: nenhum card e a lista de hoje, sem classId", async () => {
    const { api } = setup({ "GET /api/me/activities": json(200, { items: [], nextCursor: null }) }, NONE, { classes: [] });
    expect(await screen.findByText("Você ainda não tem atividades.")).toBeTruthy();
    expect(document.getElementById(SUBJECT_SELECT_ID)).toBeNull();
    expect(activityCalls(api.calls)).toEqual(["/api/me/activities"]);
  });

  it("026/US1-7 026/SC-001 sem violações, o card antes dos cartões de resumo e na ordem de Tab antes dos filtros", async () => {
    const { container, user } = setup(
      { [listRoute()]: json(200, { items: [summary({ title: "Única" })], nextCursor: null }) },
      NONE,
      { classes: [POO, SQL] },
    );
    await screen.findByRole("heading", { name: "Única" });
    await expectNoA11yViolations(container);
    const summaryRegion = screen.getByRole("region", { name: "Resumo das atividades exibidas" });
    expect(subjectSelect().compareDocumentPosition(summaryRegion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expectTabOrder(user, [
      subjectSelect(),
      document.getElementById(FILTER_IDS.status)!,
      document.getElementById(FILTER_IDS.type)!,
      screen.getByRole("link", { name: "Iniciar" }),
    ]);
  });

  it("026/SC-006 o endereço leva a matéria primeiro, depois situação e tipo", () => {
    expect(myActivitiesHref({ materia: SQL.id, status: "OVERDUE" })).toBe(`/minhas-atividades?materia=${SQL.id}&situacao=atrasadas`);
    expect(myActivitiesHref({ materia: SQL.id, status: null, type: "EXAM" })).toBe(`/minhas-atividades?materia=${SQL.id}&tipo=prova`);
    expect(myActivitiesHref({ materia: null, status: "PENDING" })).toBe("/minhas-atividades?situacao=pendentes");
  });
});
