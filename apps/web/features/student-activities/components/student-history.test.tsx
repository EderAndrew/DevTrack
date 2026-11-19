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
import { HISTORY_FINAL_NOTE, historyFromSearch } from "../schemas/student-history";
import { ActivityAnswering } from "./activity-answering";
import { LOAD_ERROR } from "./load-states";
import { HISTORY_EMPTY, OwnExamOccurrences, SCREEN_EXITS_NOTE, StudentHistory } from "./student-history";
import { apiError, json, routedFetch, studentActivity, summary } from "./test-fixtures";

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
  situation: "AWAITING",
  ...overrides,
});
const page = (items: StudentHistoryItem[], extra: Partial<StudentHistoryPage> = {}): StudentHistoryPage => ({
  items,
  nextCursor: null,
  total: items.length,
  tabCounts: { all: 4, awaiting: 2, graded: 2 },
  totals: { delivered: 4, awaiting: 2, graded: 2 },
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
const exercise = entry({
  id: "bbbbbbbb-0000-4000-8000-000000000013",
  title: "Exercícios de laços",
  type: "EXERCISE",
  status: "COMPLETED",
  situation: "GRADED",
  deadline: null,
  latePolicy: null,
  totalGrade: null,
  points: { possible: 60, earned: 45, awaitingCorrection: false },
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
const FOUR = [graded, waiting, exercise, exam];

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

  it("028/US1-5 exercício: \"Concluída\" e os pontos, nunca a barra; pontos aguardando correção", async () => {
    const pendingPoints = entry({ ...exercise, id: "bbbbbbbb-0000-4000-8000-000000000015", title: "Exercícios de vetores", points: { possible: 60, earned: 15, awaitingCorrection: true } });
    setup({ [HISTORY]: json(200, page([exercise, pendingPoints])) });
    const row = await rowOf("Exercícios de laços");
    expect(within(row).getByText("Concluída")).toBeTruthy();
    expect(within(row).getByText("45 de 60 pontos")).toBeTruthy();
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(within(await rowOf("Exercícios de vetores")).getByText("Pontos aguardando correção")).toBeTruthy();
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
      [`${HISTORY}?cursor=c1`]: json(200, page([exercise, exam], { total: 4 })),
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
    expect(all.map((tab) => tab.getAttribute("aria-label"))).toEqual(["Todas, 4", "Aguardando, 3", "Corrigidas, 1"]);
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
