import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import type { IntegrityEventView, StudentHistoryItem, StudentHistoryPage, StudentIntegrity } from "@repo/contracts";
import { formatTime } from "@/lib/messages/dates";
import { helpItem, helpState } from "@/features/work-help/components/test-fixtures";
import type { StudentHistoryFilters } from "../api/student-activities";
import { HISTORY_DESCRIPTION, HISTORY_FINAL_NOTE, HISTORY_TABS, historyFromSearch } from "../schemas/student-history";
import { ActivityAnswering } from "./activity-answering";
import { LOAD_ERROR } from "./load-states";
import { HISTORY_EMPTY, OwnExamOccurrences, SCREEN_EXITS_NOTE, StudentHistory } from "./student-history";
import { apiError, json, myClass, myClassesBody, POO_CLASS, routedFetch, SQL_CLASS, studentActivity, summary } from "./test-fixtures";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const HISTORY = "GET /api/me/history";

function setup(routes: Parameters<typeof routedFetch>[0], filters?: StudentHistoryFilters) {
  const api = routedFetch(routes);
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<StudentHistory filters={filters} />);
  return { ...view, api, user: userEvent.setup() };
}

// Built from local time, so "13 de novembro" and "Sexta-feira, 16:47" read the same in any time zone.
const FRIDAY = new Date(2026, 10, 13, 16, 47).toISOString();

const entry = (overrides: Partial<StudentHistoryItem> = {}): StudentHistoryItem => ({
  ...summary({ status: "SUBMITTED", canAnswer: false, submittedAt: FRIDAY }),
  deliveredAt: FRIDAY,
  // 029/FR-006: `missedAt` became `endedAt` (the close), always set.
  endedAt: FRIDAY,
  situation: "AWAITING",
  ...overrides,
});
/** A page; `missed` (028 amendment) defaults to 0 in the tab counts and the totals. */
const page = (
  items: StudentHistoryItem[],
  {
    tabCounts,
    totals,
    ...extra
  }: Partial<Omit<StudentHistoryPage, "tabCounts" | "totals">> & {
    tabCounts?: Partial<StudentHistoryPage["tabCounts"]>;
    totals?: Partial<StudentHistoryPage["totals"]>;
  } = {},
): StudentHistoryPage => ({
  items,
  nextCursor: null,
  total: items.length,
  tabCounts: { all: 4, awaiting: 2, graded: 2, missed: 0, cancelled: 0, ...tabCounts },
  totals: { delivered: 4, awaiting: 2, graded: 2, missed: 0, cancelled: 0, ...totals },
  ...extra,
});

const graded = entry({
  id: "bbbbbbbb-0000-4000-8000-000000000011",
  title: "Trabalho de interfaces",
  status: "GRADED",
  situation: "GRADED",
  class: { id: "11111111-1111-4111-8111-111111111111", name: "ADS 3NA" },
  subjectName: "Programação Orientada a Objetos",
  totalGrade: "3.00",
  result: { grade: "1.80", hasFeedback: true },
});
const waiting = entry({
  id: "bbbbbbbb-0000-4000-8000-000000000012",
  title: "Lista de herança",
  late: true,
  class: { id: "11111111-1111-4111-8111-111111111111", name: "ADS 3NA" },
  subjectName: null,
});
// 029/FR-001: rows are never exercises; the third row is another closed work, awaiting its grade.
const collections = entry({
  id: "bbbbbbbb-0000-4000-8000-000000000013",
  title: "Trabalho de coleções",
  class: { id: "11111111-1111-4111-8111-111111111111", name: "ADS 3NA" },
  subjectName: "Programação Orientada a Objetos",
  totalGrade: "2.00",
});
const exam = entry({
  id: "bbbbbbbb-0000-4000-8000-000000000014",
  title: "Prova de POO",
  type: "EXAM",
  status: "GRADED",
  situation: "GRADED",
  totalGrade: "1.00",
  result: { grade: "1.50", hasFeedback: false },
});
const FOUR = [graded, waiting, collections, exam];

const table = () => screen.findByRole("table", { name: "Atividades que você entregou." });
const rowOf = async (title: string) =>
  Array.from((await table()).querySelectorAll<HTMLElement>("tbody tr")).find((row) => row.textContent?.includes(title))!;

describe("028/US1 Histórico: totais e lista redesenhada", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("028/US1-1 os três cards com os totais do servidor, em dois dígitos e o número inteiro no texto acessível", async () => {
    setup({ [HISTORY]: json(200, page([graded], { totals: { delivered: 4, awaiting: 2, graded: 12 } })) });
    const summary = await screen.findByRole("region", { name: "Resumo das suas entregas" });
    const cards = within(summary).getAllByRole("listitem");
    expect(cards.map((card) => within(card).getByText(/^Atividades|^Aguardando/).textContent)).toEqual([
      "Atividades entregues",
      "Aguardando correção",
      "Atividades corrigidas",
    ]);
    expect(within(cards[0]!).getByText("04")).toBeTruthy();
    expect(within(cards[0]!).getByText("4 atividades entregues")).toBeTruthy();
    expect(within(cards[0]!).getByText("Seu histórico de entregas")).toBeTruthy();
    expect(within(cards[1]!).getByText("02")).toBeTruthy();
    expect(within(cards[1]!).getByText("2 aguardando correção")).toBeTruthy();
    expect(within(cards[1]!).getByText("Você já fez a sua parte")).toBeTruthy();
    expect(within(cards[2]!).getByText("12")).toBeTruthy();
    expect(within(cards[2]!).getByText("12 atividades corrigidas")).toBeTruthy();
    expect(within(cards[2]!).getByText("Resultado disponível")).toBeTruthy();
  });

  it("028/US1-2 o rodapé diz quantas de quantas e a ordem", async () => {
    setup({ [HISTORY]: json(200, page(FOUR)) });
    await table();
    expect(screen.getByText("Exibindo 4 de 4 atividades")).toBeTruthy();
    expect(screen.getByText("Mais recentes primeiro")).toBeTruthy();
  });

  it("028/US1-3 012/US6-2 aguardando: pílula \"Entregue com atraso\" e \"Aguardando correção\", sem número de nota", async () => {
    setup({ [HISTORY]: json(200, page(FOUR)) });
    const row = await rowOf("Lista de herança");
    expect(within(row).getByText("Entregue com atraso")).toBeTruthy();
    expect(within(row).getByText("Aguardando correção")).toBeTruthy();
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(row.textContent).not.toMatch(/\d,\d\d/);
  });

  it("028/US1-4 012/FR-031 corrigida: \"Corrigida\", a nota de a total, a barra proporcional e \"Com feedback\"", async () => {
    setup({ [HISTORY]: json(200, page(FOUR)) });
    const row = await rowOf("Trabalho de interfaces");
    expect(within(row).getByText("Corrigida")).toBeTruthy();
    expect(within(row).getByText("1,80")).toBeTruthy();
    expect(within(row).getByText("de 3,00")).toBeTruthy();
    const bar = within(row).getByRole("progressbar", { name: "Nota 1,80 de 3,00" });
    expect(bar.getAttribute("aria-valuenow")).toBe("60");
    expect(within(row).getByText("Com feedback")).toBeTruthy();
    // Edge case: a grade above the total fills the bar, never past it.
    const over = await rowOf("Prova de POO");
    expect(within(over).getByRole("progressbar", { name: "Nota 1,50 de 1,00" }).getAttribute("aria-valuenow")).toBe("100");
    expect(within(over).queryByText("Com feedback")).toBeNull();
  });

  // 029/FR-001: exercises never reach the history, so no row says "Concluída" or shows points.
  it("028/US1-5 029/FR-001 sem exercícios: nenhuma linha diz \"Concluída\" nem mostra pontos", async () => {
    setup({ [HISTORY]: json(200, page(FOUR)) });
    const rows = await table();
    expect(within(rows).queryByText("Concluída")).toBeNull();
    expect(within(rows).queryByText("Exercício")).toBeNull();
    expect(rows.textContent).not.toMatch(/pontos/);
    expect(within(await rowOf("Trabalho de coleções")).getByText("Aguardando correção")).toBeTruthy();
  });

  it("028/US1-6 título, \"Ver atividade\" e a seta abrem a atividade; tipo, turma e disciplina, data em duas linhas", async () => {
    setup({ [HISTORY]: json(200, page(FOUR)) });
    const row = await rowOf("Trabalho de interfaces");
    const href = `/minhas-atividades/${graded.id}`;
    expect(within(row).getByRole("link", { name: "Trabalho de interfaces" }).getAttribute("href")).toBe(href);
    expect(within(row).getByText("Ver atividade").closest("a")!.getAttribute("href")).toBe(href);
    expect(within(row).getByRole("link", { name: "Abrir Trabalho de interfaces" }).getAttribute("href")).toBe(href);
    expect(within(row).getByText("Trabalho")).toBeTruthy();
    expect(within(row).getByText("ADS 3NA")).toBeTruthy();
    expect(within(row).getByText("Programação Orientada a Objetos")).toBeTruthy();
    expect(within(row).getByText("13 de novembro")).toBeTruthy();
    expect(within(row).getByText("Sexta-feira, 16:47")).toBeTruthy();
    // Only the turma when there is no subject; "com atraso" on the second line of the date.
    const late = await rowOf("Lista de herança");
    expect(within(late).getByText("ADS 3NA").parentElement!.children).toHaveLength(1);
    expect(within(late).getByText("Sexta-feira, 16:47 (com atraso)")).toBeTruthy();
    expect(within(await rowOf("Prova de POO")).getByText("Prova")).toBeTruthy();
    // Phones: the same deliveries as cards, each one link.
    const cards = screen.getByRole("list", { name: "Atividades que você entregou." });
    expect(within(cards).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(FOUR.map((item) => `/minhas-atividades/${item.id}`));
  });

  it("028/US1-7 a tela termina com a nota sobre as notas", async () => {
    setup({ [HISTORY]: json(200, page(FOUR)) });
    await table();
    expect(screen.getByText(HISTORY_FINAL_NOTE).textContent).toBe("As notas aparecem aqui assim que a correção for concluída.");
  });

  it("028/US1-8 012/US6-1 sem entregas: cards em zero e o estado vazio; erro é outro estado", async () => {
    setup({ [HISTORY]: json(200, page([], { tabCounts: { all: 0, awaiting: 0, graded: 0 }, totals: { delivered: 0, awaiting: 0, graded: 0 } })) });
    expect(await screen.findByText(HISTORY_EMPTY)).toBeTruthy();
    expect(screen.getByText("0 atividades entregues")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    vi.unstubAllGlobals();
    cleanup();
    setup({ [HISTORY]: apiError(500, "INTERNAL_ERROR", "x") });
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("028/US1-9 \"Carregar mais\" pede o cursor e o N do rodapé cresce", async () => {
    const { user, api } = setup({
      [HISTORY]: json(200, page([graded, waiting], { nextCursor: "c1", total: 4 })),
      [`${HISTORY}?cursor=c1`]: json(200, page([collections, exam], { total: 4 })),
    });
    await table();
    expect(screen.getByText("Exibindo 2 de 4 atividades")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByText("Exibindo 4 de 4 atividades")).toBeTruthy();
    expect(api.calls.some((call) => call.url.endsWith("/me/history?cursor=c1"))).toBe(true);
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
  });

  it("028/FR-019 um título com HTML aparece como texto", async () => {
    setup({ [HISTORY]: json(200, page([entry({ title: "<b>negrito</b>" })])) });
    const row = await rowOf("<b>negrito</b>");
    expect(within(row).getByRole("link", { name: "<b>negrito</b>" })).toBeTruthy();
    expect(row.querySelector("b")).toBeNull();
  });

  it("012/SC-009 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setup({ [HISTORY]: json(200, page(FOUR, { nextCursor: "c1" })) });
    const rows = await table();
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      within(rows).getByRole("link", { name: "Trabalho de interfaces" }),
      within(rows).getByRole("link", { name: "Abrir Trabalho de interfaces" }),
      within(rows).getByRole("link", { name: "Lista de herança" }),
      screen.getByRole("button", { name: "Carregar mais" }),
    ]);
  });
});

describe("028/US2 Histórico: abas Todas, Aguardando e Corrigidas", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  const COUNTS = { tabCounts: { all: 4, awaiting: 3, graded: 1 } };
  const tabs = () => screen.findByRole("tablist", { name: "Situação das entregas" });

  it("028/US2-1 as três abas com as contagens, \"Todas\" escolhida e o nome com a contagem", async () => {
    setup({ [HISTORY]: json(200, page(FOUR, COUNTS)) });
    const list = await tabs();
    const all = within(list).getAllByRole("tab");
    // 028/FR-004 (amendment 2026-11-23): a fourth tab, "Não entregues". 029/FR-003: a fifth, "Canceladas".
    expect(all.map((tab) => tab.getAttribute("aria-label"))).toEqual(["Todas, 4", "Aguardando, 3", "Corrigidas, 1", "Não entregues, 0", "Canceladas, 0"]);
    expect(within(list).getByRole("tab", { name: "Aguardando, 3" }).textContent).toBe("Aguardando3");
    expect(within(list).getByRole("tab", { name: "Todas, 4" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Todas, 4" })).toBeTruthy();
  });

  it("028/US2-2 028/SC-003 um clique em \"Corrigidas\" troca o endereço e a lista passa a pedir tab=GRADED", async () => {
    const { user, api, rerender } = setup({
      [HISTORY]: json(200, page(FOUR, COUNTS)),
      [`${HISTORY}?tab=GRADED`]: json(200, page([graded], { ...COUNTS, total: 1 })),
    });
    await user.click(within(await tabs()).getByRole("tab", { name: "Corrigidas, 1" }));
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenLastCalledWith("/historico?aba=corrigidas");
    rerender(<StudentHistory filters={historyFromSearch({ aba: "corrigidas" })} />);
    expect(await screen.findByText("Exibindo 1 de 1 atividade")).toBeTruthy();
    expect(api.calls.some((call) => call.url.endsWith("/me/history?tab=GRADED"))).toBe(true);
    expect(screen.getByRole("tab", { name: "Corrigidas, 1" }).getAttribute("aria-selected")).toBe("true");
    // Back to "Todas": no `aba` in the address.
    await user.click(screen.getByRole("tab", { name: "Todas, 4" }));
    expect(router.replace).toHaveBeenLastCalledWith("/historico");
  });

  it("028/US2-4 aba vazia: a frase da aba, com os cards e as abas", async () => {
    setup({ [`${HISTORY}?tab=AWAITING`]: json(200, page([], { ...COUNTS, total: 0 })) }, historyFromSearch({ aba: "aguardando" }));
    expect(await screen.findByText("Nenhuma entrega aguardando correção.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resumo das suas entregas" })).toBeTruthy();
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    vi.unstubAllGlobals();
    cleanup();
    setup({ [`${HISTORY}?tab=GRADED`]: json(200, page([], { ...COUNTS, total: 0 })) }, historyFromSearch({ aba: "corrigidas" }));
    expect(await screen.findByText("Nenhuma entrega corrigida ainda.")).toBeTruthy();
    expect(screen.getByRole("tablist")).toBeTruthy();
  });

  it("028/US2-5 a página aberta com ?aba=corrigidas já pede tab=GRADED; ?aba=xyz vale \"Todas\"", async () => {
    expect(historyFromSearch({ aba: "corrigidas" })).toEqual({ tab: "GRADED", q: "", classId: null });
    expect(historyFromSearch({ aba: "aguardando" }).tab).toBe("AWAITING");
    expect(historyFromSearch({ aba: "xyz" }).tab).toBeNull();
    expect(historyFromSearch({ aba: "todas" }).tab).toBeNull();
    expect(historyFromSearch({}).tab).toBeNull();
    const { api } = setup({ [`${HISTORY}?tab=GRADED`]: json(200, page([graded], { ...COUNTS, total: 1 })) }, historyFromSearch({ aba: "corrigidas" }));
    expect(within(await tabs()).getByRole("tab", { name: "Corrigidas, 1" }).getAttribute("aria-selected")).toBe("true");
    expect(api.calls.map((call) => call.url).filter((url) => url.includes("/me/history"))).toEqual([expect.stringMatching(/\/me\/history\?tab=GRADED$/)]);
  });

  it("028/US2 as setas do teclado trocam de aba", async () => {
    const { user } = setup({ [HISTORY]: json(200, page(FOUR, COUNTS)) });
    const list = await tabs();
    within(list).getByRole("tab", { name: "Todas, 4" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(within(list).getByRole("tab", { name: "Aguardando, 3" }));
    expect(router.replace).toHaveBeenLastCalledWith("/historico?aba=aguardando");
  });
});

describe("028/US3 Histórico: buscar e filtrar por matéria", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
  });

  const CLASSES = "GET /api/me/classes";
  const classes = (list = [POO_CLASS, SQL_CLASS]) => json(200, myClassesBody(list));
  const historyCalls = (api: { calls: { url: string }[] }) => api.calls.map((call) => call.url).filter((url) => url.includes("/me/history"));
  const search = () => screen.findByRole("searchbox", { name: "Buscar atividade" });
  const subjectSelect = () => screen.findByRole("combobox", { name: "Matéria" });

  it("028/US3-1 digitar na busca pede q= só depois de 300 ms e escreve busca= no endereço; Enter pede na hora", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = routedFetch({
      [CLASSES]: classes(),
      [HISTORY]: json(200, page(FOUR)),
      [`${HISTORY}?q=prova`]: json(200, page([exam], { total: 1 })),
      [`${HISTORY}?q=lista`]: json(200, page([waiting], { total: 1 })),
    });
    vi.stubGlobal("fetch", api.fetch);
    renderWithProviders(<StudentHistory />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const box = await search();
    expect(box.getAttribute("maxlength")).toBe("100");
    await user.type(box, "prova");
    expect(router.replace).not.toHaveBeenCalled();
    expect(historyCalls(api).some((url) => url.includes("q="))).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenLastCalledWith("/historico?busca=prova");
    expect(await screen.findByText("Exibindo 1 de 1 atividade")).toBeTruthy();
    expect(historyCalls(api)).toContainEqual(expect.stringMatching(/\/me\/history\?q=prova$/));
    expect((box as HTMLInputElement).value).toBe("prova");
    // Enter: no wait.
    await user.clear(box);
    await user.type(box, "lista{Enter}");
    expect(router.replace).toHaveBeenLastCalledWith("/historico?busca=lista");
    expect(await screen.findByRole("link", { name: "Lista de herança" })).toBeTruthy();
    expect(historyCalls(api).filter((url) => /q=l(i|is|ist)?$/.test(url))).toEqual([]);
  });

  it("028/US3-5 a busca logo depois de trocar de aba, antes de o endereço mudar, mantém a aba escolhida", async () => {
    const { user } = setup(
      {
        [CLASSES]: classes(),
        [`${HISTORY}?tab=GRADED`]: json(200, page([graded], { total: 1, tabCounts: { all: 4, awaiting: 3, graded: 1 } })),
      },
      historyFromSearch({ aba: "corrigidas" }),
    );
    await user.click(within(await screen.findByRole("tablist")).getByRole("tab", { name: "Todas, 4" }));
    expect(router.replace).toHaveBeenLastCalledWith("/historico");
    // The router mock never moves the address: it is still `?aba=corrigidas` when the search applies.
    await user.type(await search(), "prova{Enter}");
    expect(router.replace).toHaveBeenLastCalledWith("/historico?busca=prova");
  });

  it("028/US3-2 busca sem resultado: \"Nenhuma atividade encontrada.\" e \"Limpar busca e filtro\" mantém a aba", async () => {
    const { user, api } = setup(
      {
        [CLASSES]: classes(),
        [`${HISTORY}?tab=GRADED&q=xyz&classId=${POO_CLASS.id}`]: json(200, page([], { total: 0, tabCounts: { all: 0, awaiting: 0, graded: 0 } })),
        [`${HISTORY}?tab=GRADED`]: json(200, page([graded], { total: 1 })),
      },
      historyFromSearch({ aba: "corrigidas", busca: "xyz", materia: POO_CLASS.id }),
    );
    expect(await screen.findByText("Nenhuma atividade encontrada.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resumo das suas entregas" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpar busca e filtro" }));
    expect(router.replace).toHaveBeenLastCalledWith("/historico?aba=corrigidas");
    expect(await screen.findByText("Exibindo 1 de 1 atividade")).toBeTruthy();
    expect(historyCalls(api).at(-1)).toMatch(/\/me\/history\?tab=GRADED$/);
    expect(((await search()) as HTMLInputElement).value).toBe("");
    expect(((await subjectSelect()) as HTMLSelectElement).value).toBe("");
  });

  it("028/US3-3 o filtro \"Matéria\" oferece \"Todas as matérias\" e as matérias de \"Minhas turmas\" como o card da 026", async () => {
    const closed = myClass({ id: "33333333-3333-4333-8333-333333333333", name: "ADS 2NA", subjectName: "Algoritmos", status: "INACTIVE" });
    setup({ [CLASSES]: classes([POO_CLASS, SQL_CLASS, closed]), [HISTORY]: json(200, page(FOUR)) });
    const select = await subjectSelect();
    await screen.findByRole("option", { name: "Banco de Dados · ADS 3NA" });
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Todas as matérias",
      "Programação Orientada a Objetos · ADS 3NA",
      "Banco de Dados · ADS 3NA",
      "Algoritmos · ADS 2NA · Encerrada",
    ]);
    expect((select as HTMLSelectElement).value).toBe("");
  });

  it("028/US3-4 escolher uma matéria troca o endereço (materia=) e pede classId=", async () => {
    const { user, api } = setup({
      [CLASSES]: classes(),
      [HISTORY]: json(200, page(FOUR)),
      [`${HISTORY}?classId=${SQL_CLASS.id}`]: json(200, page([waiting], { total: 1, totals: { delivered: 1, awaiting: 1, graded: 0 } })),
    });
    await table();
    await screen.findByRole("option", { name: "Banco de Dados · ADS 3NA" });
    await user.selectOptions(await subjectSelect(), SQL_CLASS.id);
    expect(router.replace).toHaveBeenLastCalledWith(`/historico?materia=${SQL_CLASS.id}`);
    expect(await screen.findByText("1 atividade entregue")).toBeTruthy();
    expect(historyCalls(api).at(-1)).toMatch(new RegExp(`/me/history\\?classId=${SQL_CLASS.id}$`));
  });

  it("028/US3-5 aberta com ?aba=corrigidas&busca=prova&materia=<A> pede as três juntas", async () => {
    const filters = historyFromSearch({ aba: "corrigidas", busca: "  prova ", materia: POO_CLASS.id });
    expect(filters).toEqual({ tab: "GRADED", q: "prova", classId: POO_CLASS.id });
    const { api } = setup({ [CLASSES]: classes(), [`${HISTORY}?tab=GRADED&q=prova&classId=${POO_CLASS.id}`]: json(200, page([exam], { total: 1 })) }, filters);
    expect(await screen.findByText("Exibindo 1 de 1 atividade")).toBeTruthy();
    expect(historyCalls(api)).toEqual([expect.stringMatching(new RegExp(`/me/history\\?tab=GRADED&q=prova&classId=${POO_CLASS.id}$`))]);
    expect(((await search()) as HTMLInputElement).value).toBe("prova");
    expect(((await subjectSelect()) as HTMLSelectElement).value).toBe(POO_CLASS.id);
    expect(screen.getByRole("tab", { name: "Corrigidas, 2" }).getAttribute("aria-selected")).toBe("true");
    // A search longer than the API's limit is cut to 100 characters, a repeated parameter ignored.
    expect(historyFromSearch({ busca: "a".repeat(150) }).q).toHaveLength(100);
    expect(historyFromSearch({ busca: ["a", "b"], materia: ["x", "y"] })).toEqual({ tab: null, q: "", classId: null });
  });

  it("028/US3-6 matéria fora de \"Minhas turmas\": o aviso e o pedido sem classId", async () => {
    const { api } = setup({ [CLASSES]: classes([POO_CLASS]), [HISTORY]: json(200, page(FOUR)) }, historyFromSearch({ materia: SQL_CLASS.id }));
    expect(await screen.findByText("Essa matéria não está mais disponível para você.")).toBeTruthy();
    await table();
    expect(historyCalls(api)).toEqual([expect.stringMatching(/\/me\/history$/)]);
    expect(((await subjectSelect()) as HTMLSelectElement).value).toBe("");
  });

  it("028/US3-6 um 404 da rota para a matéria: \"Minhas turmas\" de novo, o aviso e o pedido sem classId", async () => {
    let classesCalls = 0;
    const { api } = setup(
      {
        [CLASSES]: () => classes(++classesCalls === 1 ? [POO_CLASS, SQL_CLASS] : [POO_CLASS]),
        [`${HISTORY}?classId=${SQL_CLASS.id}`]: apiError(404, "NOT_FOUND", "Não encontrado."),
        [HISTORY]: json(200, page(FOUR)),
      },
      historyFromSearch({ materia: SQL_CLASS.id }),
    );
    expect(await screen.findByText("Essa matéria não está mais disponível para você.")).toBeTruthy();
    await table();
    expect(classesCalls).toBeGreaterThanOrEqual(2);
    expect(historyCalls(api)).toEqual([expect.stringContaining(`classId=${SQL_CLASS.id}`), expect.stringMatching(/\/me\/history$/)]);
    expect(screen.queryByText(LOAD_ERROR)).toBeNull();
  });

  it("028/FR-020 sem violações de acessibilidade nos temas escuro e claro; Tab: abas → busca → matéria → linhas → Carregar mais", async () => {
    const { user, container } = setup({ [CLASSES]: classes(), [HISTORY]: json(200, page(FOUR, { nextCursor: "c1" })) });
    const rows = await table();
    await screen.findByRole("option", { name: "Banco de Dados · ADS 3NA" });
    await expectNoA11yViolations(container);
    document.documentElement.dataset.theme = "light";
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("tab", { name: "Todas, 4" }),
      await search(),
      await subjectSelect(),
      within(rows).getByRole("link", { name: "Trabalho de interfaces" }),
      screen.getByRole("button", { name: "Carregar mais" }),
    ]);
  });
});

// 028/US4 — nothing of a grade before the release: the screen follows `situation`, so even a payload that carried a
// result on an AWAITING item (never sent by the API, 028/SC-002) shows no grade, bar or "Com feedback".

describe("028/US5 Histórico: não entregues (emenda 2026-11-23)", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  // Local time, as FRIDAY: "10 de novembro" and "Terça-feira, 23:59".
  const TUESDAY = new Date(2026, 10, 10, 23, 59).toISOString();
  const missed = entry({
    id: "bbbbbbbb-0000-4000-8000-000000000021",
    title: "Trabalho perdido",
    status: "OVERDUE",
    late: false,
    submittedAt: null,
    deliveredAt: null,
    endedAt: TUESDAY,
    situation: "MISSED",
    totalGrade: "2.00",
  });
  const COUNTS = { tabCounts: { all: 5, awaiting: 2, graded: 2, missed: 1 }, totals: { missed: 1 } };

  it("028/US5-2 028/FR-024 a aba \"Não entregues\" com a contagem; a linha diz \"Não entregue\", a data em que fechou e \"—\" na Nota", async () => {
    const { user } = setup({ [HISTORY]: json(200, page([graded, missed], COUNTS)) });
    const tabs = await screen.findByRole("tablist", { name: "Situação das entregas" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Todas, 5",
      "Aguardando, 2",
      "Corrigidas, 2",
      "Não entregues, 1",
      // 029/FR-003: the fifth tab.
      "Canceladas, 0",
    ]);
    const row = await rowOf("Trabalho perdido");
    expect(within(row).getByText("Não entregue")).toBeTruthy();
    // 029/FR-006: without a delivery, the date is the close.
    expect(within(row).getByText("Encerrada em 10 de novembro")).toBeTruthy();
    expect(within(row).getByText("Terça-feira, 23:59")).toBeTruthy();
    expect(within(row).getByText("—")).toBeTruthy();
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(within(row).queryByText("Aguardando correção")).toBeNull();
    // The cards are the deliveries only.
    expect(screen.getByText("4 atividades entregues")).toBeTruthy();
    await user.click(within(tabs).getByRole("tab", { name: "Não entregues, 1" }));
    expect(router.replace).toHaveBeenLastCalledWith("/historico?aba=nao-entregues");
    expect(historyFromSearch({ aba: "nao-entregues" }).tab).toBe("MISSED");
  });

  it("028/US5-5 aba \"Não entregues\" vazia: a frase própria, com os cards e as abas", async () => {
    setup({ [`${HISTORY}?tab=MISSED`]: json(200, page([], { total: 0 })) }, historyFromSearch({ aba: "nao-entregues" }));
    expect(await screen.findByText("Nenhuma atividade não entregue.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resumo das suas entregas" })).toBeTruthy();
    expect(screen.getByRole("tablist")).toBeTruthy();
  });

  it("028/FR-015 sem entregas mas com não entregues: a lista, não o vazio da página", async () => {
    setup({ [HISTORY]: json(200, page([missed], { totals: { delivered: 0, awaiting: 0, graded: 0, missed: 1 }, tabCounts: { all: 1, awaiting: 0, graded: 0, missed: 1 } })) });
    expect(await rowOf("Trabalho perdido")).toBeTruthy();
    expect(screen.queryByText(HISTORY_EMPTY)).toBeNull();
  });
});

describe("029/US1 Histórico só com o que o professor encerrou", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  // Local time, as FRIDAY: "10 de novembro" and "Terça-feira, 23:59".
  const TUESDAY = new Date(2026, 10, 10, 23, 59).toISOString();
  const closedMissed = entry({
    id: "bbbbbbbb-0000-4000-8000-000000000031",
    title: "Prova não feita",
    type: "EXAM",
    status: "OVERDUE",
    late: false,
    submittedAt: null,
    deliveredAt: null,
    endedAt: TUESDAY,
    situation: "MISSED",
    totalGrade: "10.00",
  });

  it("029/US1-2 encerrada sem entrega: \"Não entregue\", \"Encerrada em …\" com o dia da semana e \"—\" na Nota, fora dos cards", async () => {
    setup({ [HISTORY]: json(200, page([closedMissed], { tabCounts: { all: 1, awaiting: 0, graded: 0, missed: 1 }, totals: { delivered: 0, awaiting: 0, graded: 0, missed: 1 } })) });
    const row = await rowOf("Prova não feita");
    expect(within(row).getByText("Não entregue")).toBeTruthy();
    expect(within(row).getByText("Encerrada em 10 de novembro")).toBeTruthy();
    expect(within(row).getByText("Terça-feira, 23:59")).toBeTruthy();
    expect(within(row).getByText("—")).toBeTruthy();
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("0 atividades entregues")).toBeTruthy();
    // A delivered row keeps the delivery's day alone (028).
    vi.unstubAllGlobals();
    cleanup();
    setup({ [HISTORY]: json(200, page([graded])) });
    expect(within(await rowOf("Trabalho de interfaces")).getByText("13 de novembro")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Data" })).toBeTruthy();
  });

  it("029/US1-6 Histórico vazio: cards em zero e \"Nenhuma atividade encerrada ainda.\"", async () => {
    setup({ [HISTORY]: json(200, page([], { tabCounts: { all: 0, awaiting: 0, graded: 0 }, totals: { delivered: 0, awaiting: 0, graded: 0 } })) });
    expect(await screen.findByText("Nenhuma atividade encerrada ainda.")).toBeTruthy();
    expect(screen.getByText("0 atividades entregues")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("029/FR-011 os estados vazios: \"Todas\" com a frase nova, as outras abas como na 028", () => {
    expect(HISTORY_EMPTY).toBe("Nenhuma atividade encerrada ainda.");
    expect(HISTORY_TABS.map((spec) => [spec.slug, spec.empty])).toEqual([
      ["todas", "Nenhuma atividade encerrada ainda."],
      ["aguardando", "Nenhuma entrega aguardando correção."],
      ["corrigidas", "Nenhuma entrega corrigida ainda."],
      ["nao-entregues", "Nenhuma atividade não entregue."],
      ["canceladas", "Nenhuma atividade cancelada."],
    ]);
    expect(HISTORY_DESCRIPTION).toBe("Provas e trabalhos encerrados ou cancelados pelo professor.");
  });
});

describe("029/US2 Histórico: provas e trabalhos cancelados", () => {
  beforeEach(() => router.replace.mockReset());
  afterEach(() => {
    vi.unstubAllGlobals();
    delete document.documentElement.dataset.theme;
  });

  // Local time, as FRIDAY: "11 de novembro" and "Quarta-feira, 09:30".
  const WEDNESDAY = new Date(2026, 10, 11, 9, 30).toISOString();
  const cancelledDelivered = entry({
    id: "bbbbbbbb-0000-4000-8000-000000000041",
    title: "Trabalho cancelado entregue",
    status: "SUBMITTED",
    deliveredAt: FRIDAY,
    endedAt: WEDNESDAY,
    situation: "CANCELLED",
    totalGrade: "2.00",
  });
  const cancelledMissed = entry({
    id: "bbbbbbbb-0000-4000-8000-000000000042",
    title: "Prova cancelada",
    type: "EXAM",
    status: "OVERDUE",
    late: false,
    submittedAt: null,
    deliveredAt: null,
    endedAt: WEDNESDAY,
    situation: "CANCELLED",
    totalGrade: "10.00",
  });
  const CANCELLED = [cancelledDelivered, cancelledMissed];
  const COUNTS = { tabCounts: { all: 6, awaiting: 2, graded: 2, missed: 0, cancelled: 2 }, totals: { cancelled: 2 } };

  it("029/US2-1 a aba \"Canceladas\" com a contagem; um clique escreve ?aba=canceladas e pede tab=CANCELLED", async () => {
    const { user, api, rerender } = setup({
      [HISTORY]: json(200, page([graded, ...CANCELLED], COUNTS)),
      [`${HISTORY}?tab=CANCELLED`]: json(200, page(CANCELLED, { ...COUNTS, total: 2 })),
    });
    const tabs = await screen.findByRole("tablist", { name: "Situação das entregas" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "Todas, 6",
      "Aguardando, 2",
      "Corrigidas, 2",
      "Não entregues, 0",
      "Canceladas, 2",
    ]);
    await user.click(within(tabs).getByRole("tab", { name: "Canceladas, 2" }));
    expect(router.replace).toHaveBeenLastCalledWith("/historico?aba=canceladas");
    expect(historyFromSearch({ aba: "canceladas" }).tab).toBe("CANCELLED");
    rerender(<StudentHistory filters={historyFromSearch({ aba: "canceladas" })} />);
    expect(await screen.findByText("Exibindo 2 de 2 atividades")).toBeTruthy();
    expect(api.calls.some((call) => call.url.endsWith("/me/history?tab=CANCELLED"))).toBe(true);
  });

  it("029/US2-2 cancelada com entrega: pílula \"Cancelada\", a data da entrega e \"—\" na Nota, sem nota nem feedback", async () => {
    // Even a payload that carried a result (never sent by the API, 029/SC-002) shows none: the row follows `situation`.
    const leaked = { ...cancelledDelivered, result: { grade: "1.90", hasFeedback: true } };
    setup({ [HISTORY]: json(200, page([leaked], COUNTS)) });
    const row = await rowOf("Trabalho cancelado entregue");
    expect(within(row).getByText("Cancelada")).toBeTruthy();
    expect(within(row).getByText("13 de novembro")).toBeTruthy();
    expect(within(row).getByText("Sexta-feira, 16:47")).toBeTruthy();
    expect(within(row).getByText("—")).toBeTruthy();
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(within(row).queryByText("Com feedback")).toBeNull();
    expect(within(row).queryByText("Aguardando correção")).toBeNull();
    expect(row.textContent).not.toContain("1,90");
  });

  it("029/US2-3 cancelada sem entrega: \"Cancelada em …\" com o dia da semana e \"—\" na Nota", async () => {
    setup({ [HISTORY]: json(200, page([cancelledMissed], COUNTS)) });
    const row = await rowOf("Prova cancelada");
    expect(within(row).getByText("Cancelada")).toBeTruthy();
    expect(within(row).getByText("Cancelada em 11 de novembro")).toBeTruthy();
    expect(within(row).getByText("Quarta-feira, 09:30")).toBeTruthy();
    expect(within(row).getByText("—")).toBeTruthy();
  });

  it("029/US2-4 a linha cancelada não é link: sem \"Ver atividade\", sem seta e, no celular, o cartão não é link", async () => {
    setup({ [HISTORY]: json(200, page([graded, ...CANCELLED], COUNTS)) });
    for (const item of CANCELLED) {
      const row = await rowOf(item.title);
      expect(within(row).queryAllByRole("link")).toEqual([]);
      expect(within(row).getByText(item.title)).toBeTruthy();
      expect(within(row).queryByText("Ver atividade")).toBeNull();
      expect(within(row).queryByLabelText(`Abrir ${item.title}`)).toBeNull();
    }
    // The other rows still open the activity.
    expect(within(await rowOf("Trabalho de interfaces")).getByRole("link", { name: "Trabalho de interfaces" })).toBeTruthy();
    const cards = screen.getByRole("list", { name: "Atividades que você entregou." });
    expect(within(cards).getAllByRole("listitem")).toHaveLength(3);
    expect(within(cards).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([`/minhas-atividades/${graded.id}`]);
    expect(within(cards).getByText("Prova cancelada")).toBeTruthy();
  });

  it("029/US2 aba \"Canceladas\" vazia: \"Nenhuma atividade cancelada.\", com os cards e as abas", async () => {
    setup({ [`${HISTORY}?tab=CANCELLED`]: json(200, page([], { total: 0 })) }, historyFromSearch({ aba: "canceladas" }));
    expect(await screen.findByText("Nenhuma atividade cancelada.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Resumo das suas entregas" })).toBeTruthy();
    expect(screen.getByRole("tablist")).toBeTruthy();
  });

  it("029/US2 sem violações de acessibilidade com uma linha cancelada, nos temas escuro e claro", async () => {
    const { container } = setup({ [HISTORY]: json(200, page([graded, ...CANCELLED], COUNTS)) });
    await table();
    await expectNoA11yViolations(container);
    document.documentElement.dataset.theme = "light";
    await expectNoA11yViolations(container);
  });

  it("029/SC-006 as cinco abas, com uma linha de cada situação, sem violações de acessibilidade nos temas escuro e claro", async () => {
    // The 360 px check needs a real layout: the E2E `028/SC-007` covers it in both themes.
    const missed = entry({
      id: "bbbbbbbb-0000-4000-8000-000000000043",
      title: "Trabalho não entregue",
      status: "OVERDUE",
      submittedAt: null,
      deliveredAt: null,
      endedAt: WEDNESDAY,
      situation: "MISSED",
    });
    const ALL = [graded, waiting, missed, ...CANCELLED];
    const counts = { tabCounts: { all: 5, awaiting: 1, graded: 1, missed: 1, cancelled: 2 }, totals: { delivered: 2, awaiting: 1, graded: 1, missed: 1, cancelled: 2 } };
    const tabs = [
      ["", ALL],
      ["AWAITING", [waiting]],
      ["GRADED", [graded]],
      ["MISSED", [missed]],
      ["CANCELLED", CANCELLED],
    ] as const;
    try {
      for (const [tab, items] of tabs) {
        for (const theme of ["dark", "light"] as const) {
          document.documentElement.dataset.theme = theme;
          const route = tab ? `${HISTORY}?tab=${tab}` : HISTORY;
          const slug = HISTORY_TABS.find((entry) => entry.tab === (tab || null))?.slug;
          const { container, unmount } = setup({ [route]: json(200, page([...items], { ...counts, total: items.length })) }, historyFromSearch({ aba: slug }));
          await table();
          await expectNoA11yViolations(container);
          unmount();
          vi.unstubAllGlobals();
        }
      }
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});

describe("028/US4 Histórico: nada de nota antes da liberação", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** The row of `title` in the table and its card in the phone list. */
  const placesOf = async (title: string) => {
    const row = await rowOf(title);
    const cards = screen.getByRole("list", { name: "Atividades que você entregou." });
    const card = within(cards)
      .getAllByRole("listitem")
      .find((item) => item.textContent?.includes(title))!;
    return [row, card];
  };

  it("028/FR-018 um item AWAITING nunca mostra número de nota nem \"Com feedback\"", async () => {
    const leaky = entry({
      id: "bbbbbbbb-0000-4000-8000-000000000021",
      title: "Trabalho sem liberação",
      totalGrade: "3.00",
      result: { grade: "2.40", hasFeedback: true },
    });
    setup({ [HISTORY]: json(200, page([leaky, waiting])) });
    for (const title of ["Trabalho sem liberação", "Lista de herança"]) {
      for (const place of await placesOf(title)) {
        expect(within(place).getByText("Aguardando correção")).toBeTruthy();
        expect(within(place).queryByRole("progressbar")).toBeNull();
        expect(within(place).queryByText("Com feedback")).toBeNull();
        expect(place.textContent).not.toMatch(/\d,\d\d/);
      }
    }
  });

  it("028/US4-3 status GRADED com situation AWAITING (sem notas.proprias.visualizar): pílula \"Entregue\", nunca \"Corrigida\"", async () => {
    const hidden = entry({
      id: "bbbbbbbb-0000-4000-8000-000000000022",
      title: "Trabalho liberado sem permissão",
      status: "GRADED",
      situation: "AWAITING",
      totalGrade: "3.00",
      result: null,
    });
    setup({ [HISTORY]: json(200, page([hidden])) });
    for (const place of await placesOf("Trabalho liberado sem permissão")) {
      expect(within(place).getByText("Entregue")).toBeTruthy();
      expect(within(place).queryByText("Corrigida")).toBeNull();
      expect(within(place).queryByRole("progressbar")).toBeNull();
    }
  });
});

// 015/US5 — the delivery the history opens: the AI's orientations under each question and the
// screen exits recorded in a CONTROLLED work, with their times; no grade before the release.

const delivered = studentActivity({
  type: "ASSIGNMENT",
  status: "SUBMITTED",
  canAnswer: false,
  executionMode: "CONTROLLED",
  aiHelp: { allowance: 3, used: 1 },
  submittedAt: "2026-10-02T12:30:00.000Z",
  attempt: { number: 1, startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [] },
  submission: { submittedAt: "2026-10-02T12:30:00.000Z", late: false, acceptedByTeacher: false, blankCount: 3 },
});
const [first, second] = delivered.questions as [(typeof delivered.questions)[number], (typeof delivered.questions)[number]];
const ACTIVITY = `GET /api/me/activities/${delivered.id}`;
const HELP = `GET /api/me/activities/${delivered.id}/attempt/help`;
const INTEGRITY = `GET /api/me/activities/${delivered.id}/attempt/integrity`;

const event = (type: IntegrityEventView["type"], recordedAt: string, overrides: Partial<IntegrityEventView> = {}): IntegrityEventView => ({
  type,
  questionPosition: null,
  recordedAt,
  clientOccurredAt: null,
  buffered: false,
  occurrenceOrdinal: null,
  idleSeconds: null,
  ...overrides,
});
const integrity = (events: IntegrityEventView[], screenExits: number): StudentIntegrity => ({
  events,
  totals: {
    screenExits,
    timeAwaySeconds: 120,
    fullscreenExits: 0,
    disconnections: 0,
    offlineSeconds: 0,
    clipboardBlocks: 0,
    typingLimitRejections: 0,
    fullscreenUnavailable: false,
    detectionUnavailable: false,
  },
});
const EXIT_1 = "2026-10-02T11:10:00.000Z";
const EXIT_2_CLIENT = "2026-10-02T11:20:00.000Z";
const exits = integrity(
  [
    event("SCREEN_LEFT", EXIT_1),
    event("SCREEN_RETURNED", "2026-10-02T11:12:00.000Z"),
    // Kept offline: the browser's time, earlier than the server's.
    event("SCREEN_LEFT", "2026-10-02T11:25:00.000Z", { clientOccurredAt: EXIT_2_CLIENT, buffered: true }),
    event("PASTE_BLOCKED", "2026-10-02T11:26:00.000Z", { questionPosition: 0 }),
  ],
  2,
);
const helps = helpState({
  used: 1,
  items: [
    helpItem({ questionId: first.id, question: "Por onde começo?" }),
    helpItem({
      id: "dddddddd-0000-4000-8000-000000000002",
      questionId: second.id,
      question: "O que é instância?",
      status: "OUT_OF_SCOPE",
      message: "Posso ajudar só com o assunto desta questão.",
    }),
  ],
});

function openDelivery(routes: Parameters<typeof routedFetch>[0]) {
  const api = routedFetch(routes);
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<ActivityAnswering activityId={delivered.id} userId="aluno-1" />);
  return { ...view, api, user: userEvent.setup() };
}

describe("015/US5 aluno vê as próprias ajudas e saídas na entrega", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("015/US5-1 015/FR-027 as perguntas e orientações aparecem sob cada questão, sem \"Pedir ajuda\"", async () => {
    const { user } = openDelivery({ [ACTIVITY]: json(200, delivered), [HELP]: json(200, helps), [INTEGRITY]: json(200, exits) });
    expect(await screen.findByText("Sua pergunta: Por onde começo?")).toBeTruthy();
    expect(screen.getByText(helpItem().message!)).toBeTruthy();
    expect(screen.queryByText("Sua pergunta: O que é instância?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Pedir ajuda" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Sua pergunta: O que é instância?")).toBeTruthy();
    expect(screen.getByText("Esta pergunta não usou uma ajuda.")).toBeTruthy();
  });

  it("015/US5-2 015/FR-027 \"Saídas da tela registradas: n\" com o horário de cada saída", async () => {
    const { container } = openDelivery({ [ACTIVITY]: json(200, delivered), [HELP]: json(200, helps), [INTEGRITY]: json(200, exits) });
    expect(await screen.findByRole("heading", { name: "Saídas da tela registradas: 2" })).toBeTruthy();
    expect(screen.getByText(SCREEN_EXITS_NOTE)).toBeTruthy();
    const times = within(screen.getByRole("list", { name: "Horários das saídas" })).getAllByRole("listitem");
    expect(times.map((item) => item.textContent)).toEqual([formatTime(EXIT_1), `${formatTime(EXIT_2_CLIENT)} (horário do navegador)`]);
    await expectNoA11yViolations(container);
  });

  it("015/US5-2 nenhuma saída: a contagem é 0 e não há lista; erro com \"Tentar novamente\"", async () => {
    openDelivery({ [ACTIVITY]: json(200, delivered), [HELP]: json(200, helps), [INTEGRITY]: json(200, integrity([], 0)) });
    expect(await screen.findByRole("heading", { name: "Saídas da tela registradas: 0" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Horários das saídas" })).toBeNull();
    vi.unstubAllGlobals();
    cleanup();
    openDelivery({ [ACTIVITY]: json(200, delivered), [HELP]: json(200, helps), [INTEGRITY]: apiError(500, "INTERNAL_ERROR", "x") });
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
  });

  it("015/US5-3 sem liberação: nem nota nem feedback; trabalho NORMAL não consulta os registros", async () => {
    const { api } = openDelivery({
      [ACTIVITY]: json(200, { ...delivered, executionMode: "NORMAL" }),
      [HELP]: json(200, helps),
    });
    expect(await screen.findByText("Sua pergunta: Por onde começo?")).toBeTruthy();
    expect(screen.queryByText("Nota")).toBeNull();
    expect(screen.queryByText(/Feedback|Gabarito/)).toBeNull();
    expect(screen.queryByRole("heading", { name: /Saídas da tela registradas/ })).toBeNull();
    expect(api.calls.some((call) => call.url.endsWith("/attempt/integrity"))).toBe(false);
  });
});

// 016/US4 — the student's own room exits in the delivery the history opens (FR-021).

describe("016/US4 aluno vê as próprias saídas da sala na entrega", () => {
  afterEach(() => vi.unstubAllGlobals());

  const normal = { ...delivered, executionMode: "NORMAL" as const, aiHelp: { allowance: 0 as const, used: 0 } };
  const withPauses = {
    ...normal,
    pauses: [
      { id: "eeeeeeee-0000-4000-8000-000000000001", initiatedBy: "STUDENT" as const, reason: "WATER" as const, note: null, startedAt: "2026-10-02T11:10:00.000Z", endedAt: "2026-10-02T11:14:00.000Z" },
      { id: "eeeeeeee-0000-4000-8000-000000000002", initiatedBy: "STUDENT" as const, reason: "OTHER" as const, note: "Fui buscar o carregador", startedAt: "2026-10-02T11:30:00.000Z", endedAt: "2026-10-02T11:32:30.000Z" },
      { id: "eeeeeeee-0000-4000-8000-000000000003", initiatedBy: "TEACHER" as const, reason: "TEACHER" as const, note: null, startedAt: "2026-10-02T12:00:00.000Z", endedAt: null },
    ],
  };

  it("016/US4-4 016/FR-021 o motivo, a saída, o retorno e a duração de cada pausa", async () => {
    const { container } = openDelivery({ [ACTIVITY]: json(200, withPauses) });
    const list = await screen.findByRole("list", { name: "Saídas da sala" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      `Beber água: saída às ${formatTime("2026-10-02T11:10:00.000Z")}, retorno às ${formatTime("2026-10-02T11:14:00.000Z")} (4 min)`,
      `Outro (Fui buscar o carregador): saída às ${formatTime("2026-10-02T11:30:00.000Z")}, retorno às ${formatTime("2026-10-02T11:32:30.000Z")} (2 min 30 s)`,
      `Pausado pelo professor: saída às ${formatTime("2026-10-02T12:00:00.000Z")}, sem retorno registrado`,
    ]);
    expect(screen.getByRole("heading", { name: "Saídas da sala" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("016/US4-4 sem pausas, nada aparece; o aluno nunca vê a chamada da turma", async () => {
    openDelivery({ [ACTIVITY]: json(200, normal) });
    expect(await screen.findByRole("heading", { name: delivered.title })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Saídas da sala" })).toBeNull();
    expect(screen.queryByText(/Presença|Ausente|Chamada/)).toBeNull();
  });
});

describe("018/US8-4 OwnExamOccurrences — as próprias ocorrências depois do fim", () => {
  it("lista cada ocorrência com o número, o tipo e o horário do servidor, sem rótulo de culpa", async () => {
    const { container } = renderWithProviders(
      <OwnExamOccurrences
        occurrences={[
          { ordinal: 1, kind: "SCREEN_LEFT", recordedAt: "2026-10-01T12:05:00.000Z" },
          { ordinal: 2, kind: "INACTIVITY", recordedAt: "2026-10-01T12:09:00.000Z" },
        ]}
      />,
    );
    const list = screen.getByRole("list", { name: "Ocorrências da prova" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      `1. Saiu da tela às ${formatTime("2026-10-01T12:05:00.000Z")}`,
      `2. Sem interação às ${formatTime("2026-10-01T12:09:00.000Z")}`,
    ]);
    expect(container.textContent).not.toMatch(/fraude|violação|\bcola\b/i);
    await expectNoA11yViolations(container);
  });

  it("sem ocorrências: diz isso", () => {
    renderWithProviders(<OwnExamOccurrences occurrences={[]} />);
    expect(screen.getByText("Nenhuma ocorrência registrada.")).toBeTruthy();
  });
});
