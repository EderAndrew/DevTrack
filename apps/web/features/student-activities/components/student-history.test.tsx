import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import type { IntegrityEventView, StudentIntegrity } from "@repo/contracts";
import { formatLongDateTime, formatTime } from "@/lib/messages/dates";
import { helpItem, helpState } from "@/features/work-help/components/test-fixtures";
import { ActivityAnswering } from "./activity-answering";
import { LOAD_ERROR } from "./load-states";
import { HISTORY_EMPTY, SCREEN_EXITS_NOTE, StudentHistory } from "./student-history";
import { apiError, json, routedFetch, studentActivity, summary } from "./test-fixtures";

const LIST = "GET /api/me/activities?status=COMPLETED";

function setup(routes: Parameters<typeof routedFetch>[0]) {
  const api = routedFetch(routes);
  vi.stubGlobal("fetch", api.fetch);
  const view = renderWithProviders(<StudentHistory />);
  return { ...view, api, user: userEvent.setup() };
}

const graded = summary({
  id: "bbbbbbbb-0000-4000-8000-000000000011",
  title: "Trabalho de interfaces",
  type: "ASSIGNMENT",
  status: "GRADED",
  late: true,
  canAnswer: false,
  submittedAt: "2026-10-04T10:00:00.000Z",
  totalGrade: "1.00",
  result: { grade: "0.90", hasFeedback: true },
});
const waiting = summary({
  id: "bbbbbbbb-0000-4000-8000-000000000012",
  title: "Lista de herança",
  status: "SUBMITTED",
  canAnswer: false,
  submittedAt: "2026-10-03T10:00:00.000Z",
  result: null,
});

describe("012/US6 Histórico", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("012/US6-2 012/FR-031 atividade, tipo, turma, entregue em (com atraso), situação, nota e Com feedback; abre a atividade", async () => {
    setup({ [LIST]: json(200, { items: [graded, waiting], nextCursor: null }) });
    const table = await screen.findByRole("table", { name: "Atividades que você entregou." });
    const [, first, second] = within(table).getAllByRole("row");
    expect(within(first!).getByRole("link", { name: "Trabalho de interfaces" }).getAttribute("href")).toBe(`/minhas-atividades/${graded.id}`);
    expect(within(first!).getByText("Trabalho")).toBeTruthy();
    expect(within(first!).getByText(`${formatLongDateTime("2026-10-04T10:00:00.000Z")} (com atraso)`)).toBeTruthy();
    expect(within(first!).getByText("0,90 de 1,00")).toBeTruthy();
    expect(within(first!).getByText("Com feedback")).toBeTruthy();
    expect(within(second!).getByText("Aguardando correção")).toBeTruthy();
    expect(within(second!).queryByText("Com feedback")).toBeNull();
  });

  it("012/US6-1 vazio e erro são estados distintos", async () => {
    setup({ [LIST]: json(200, { items: [], nextCursor: null }) });
    expect(await screen.findByText(HISTORY_EMPTY)).toBeTruthy();
    vi.unstubAllGlobals();
    setup({ [LIST]: apiError(500, "INTERNAL_ERROR", "x") });
    expect(await screen.findByText(LOAD_ERROR)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });

  it("012/SC-009 sem violações de acessibilidade e na ordem de Tab", async () => {
    const { user, container } = setup({ [LIST]: json(200, { items: [graded, waiting], nextCursor: null }) });
    await screen.findByRole("table");
    await expectNoA11yViolations(container);
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "Trabalho de interfaces" }),
      screen.getByRole("link", { name: "Lista de herança" }),
    ]);
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
