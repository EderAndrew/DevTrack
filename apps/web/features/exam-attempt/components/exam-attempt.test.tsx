import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentActivity, StudentExam } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ActivityAnswering } from "@/features/student-activities/components/activity-answering";
import { apiError, json, studentActivity } from "@/features/student-activities/components/test-fixtures";
import { START_CLOSED, START_EXAM, TIME_OVER } from "../schemas/exam-attempt";
import { ExamAttempt } from "./exam-shell";

// 018/US3 (contracts/web-ui.md, "Student"): the rules before the start, the explicit acceptance, the
// server's time on the focus page (ExamTimer, alerts, countdown), the last minute's immediate saves,
// "Tempo esgotado" when the server settled the attempt, and the start window closed.

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SERVER_NOW = "2026-10-02T12:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(SERVER_NOW) + ms).toISOString();
const MINUTE = 60_000;

const examFacts = (overrides: Partial<StudentExam> = {}): StudentExam => ({
  durationMinutes: 60,
  inactivityLimitSeconds: 45,
  startDeadline: at(15 * MINUTE),
  endsAt: null,
  occurrences: { count: 0, warningsAllowed: 3 },
  hold: null,
  endReason: null,
  ownOccurrences: [],
  ...overrides,
});
const exam = (overrides: Partial<StudentActivity> = {}, facts: Partial<StudentExam> = {}) =>
  studentActivity({
    type: "EXAM",
    executionMode: "CONTROLLED",
    title: "Prova de POO",
    deadline: null,
    latePolicy: null,
    totalGrade: "10.00",
    status: "PENDING",
    exam: examFacts(facts),
    ...overrides,
  });
/** Started now, ending `leftMs` after the server's now. */
const running = (leftMs: number, overrides: Partial<StudentActivity> = {}) =>
  exam(
    { status: "IN_PROGRESS", attempt: { number: 1, startedAt: SERVER_NOW, lastSavedAt: null, answers: [] }, ...overrides },
    { endsAt: at(leftMs) },
  );
const DETAIL = `/api/me/activities/${exam().id}`;

type Call = { key: string; body: unknown; at: number };

function setup(ui: React.ReactElement, current: StudentActivity | (() => StudentActivity)) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : null, at: Date.now() });
    if (key === `GET ${DETAIL}`) return json(200, typeof current === "function" ? current() : current);
    if (key === `POST ${DETAIL}/attempt`) return json(200, running(60 * MINUTE));
    if (key === `PUT ${DETAIL}/attempt/answers`) {
      const body = JSON.parse(String(init?.body)) as { answers: { questionId: string }[] };
      return json(200, { savedAt: SERVER_NOW, results: body.answers.map((answer) => ({ questionId: answer.questionId, outcome: "SAVED", revision: 1 })) });
    }
    if (key === `POST ${DETAIL}/attempt/events`) {
      const body = JSON.parse(String(init?.body)) as { events: { eventId: string }[] };
      return json(200, { recorded: body.events.map((event) => ({ eventId: event.eventId, recordedAt: SERVER_NOW })), exam: null });
    }
    return apiError(404, "NOT_FOUND", "x");
  });
  vi.stubGlobal("fetch", fetchMock);
  return { ...renderWithProviders(ui), calls, user: userEvent.setup() };
}

function fullscreenDevice() {
  let element: Element | null = null;
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => element });
  document.documentElement.requestFullscreen = vi.fn(async () => {
    element = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  document.exitFullscreen = vi.fn(async () => {
    element = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
}

describe("018/US3 aluno faz a prova com tempo controlado", () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.push.mockReset();
    router.replace.mockReset();
    fullscreenDevice();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("018/US3-1 018/FR-011 antes de iniciar, as regras; o início só pela ação explícita, com o aceite e a tela cheia", async () => {
    const { container, user, calls } = setup(<ActivityAnswering activityId={exam().id} userId="aluno-1" />, exam());
    const rules = (await screen.findByText("Regras da prova")).closest("section")!;
    expect(rules.textContent).toContain("Duração: 60 minutos");
    expect(rules.textContent).toContain("ficar 45 s sem interagir conta como ocorrência");
    expect(rules.textContent).toContain("Você recebe até 3 avisos; na 4ª ocorrência a prova é encerrada");
    expect(rules.textContent).toContain("o tempo continua correndo");
    expect(rules.textContent).toContain("Não há ajuda da IA.");
    expect(rules.textContent).not.toMatch(/fraude|\bcola\b|viola/i);
    expect(screen.queryByRole("navigation", { name: "Questões" })).toBeNull();
    expect(calls.some((call) => call.key.startsWith("POST"))).toBe(false);
    await expectNoA11yViolations(container);

    // 018/SC-011: by the keyboard alone.
    const start = screen.getByRole("button", { name: START_EXAM });
    start.focus();
    await user.keyboard("{Enter}");
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/minhas-atividades/${exam().id}/responder`));
    expect(calls.find((call) => call.key === `POST ${DETAIL}/attempt`)?.body).toEqual({ acceptRules: true });
  });

  it("018/US3-8 passado o limite para iniciar: o aviso, sem botão de início e sem pedido ao servidor", async () => {
    const closed = exam({ canAnswer: false, serverNow: at(16 * MINUTE) });
    const { calls } = setup(<ActivityAnswering activityId={closed.id} userId="aluno-1" />, closed);
    expect(await screen.findByText(START_CLOSED)).toBeTruthy();
    expect(screen.queryByRole("button", { name: START_EXAM })).toBeNull();
    expect(calls.some((call) => call.key.startsWith("POST"))).toBe(false);
  });

  it("018/US3-2 018/SC-002 o cronômetro é o do servidor: o relógio do navegador adiantado não muda o tempo restante", async () => {
    // The browser's clock is 3 hours ahead of the server's.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse(SERVER_NOW) + 3 * 60 * MINUTE));
    setup(<ExamAttempt activityId={exam().id} userId="aluno-1" />, running(30 * MINUTE));
    const timer = await screen.findByRole("timer", { name: "Tempo restante" });
    expect(timer.textContent).toBe("30:00 restantes");
    expect(screen.getByText("Prova")).toBeTruthy();
  });

  it("018/US3-3 018/SC-003 na página da prova, o alerta de 10 minutos aparece ao cruzar o marco", async () => {
    setup(<ExamAttempt activityId={exam().id} userId="aluno-1" />, running(10 * MINUTE + 1_000));
    await screen.findByRole("timer");
    expect(screen.queryByText("Faltam 10 minutos.")).toBeNull();
    expect(await screen.findByText("Faltam 10 minutos.", {}, { timeout: 2_500 })).toBeTruthy();
  });

  it("018/US3-5 018/FR-013 esgotado o tempo, a página lê a prova de novo: \"Tempo esgotado\" e as questões só para leitura", async () => {
    let reads = 0;
    const expired = exam(
      {
        status: "SUBMITTED",
        canAnswer: false,
        attempt: { number: 1, startedAt: at(-61 * MINUTE), lastSavedAt: null, answers: [] },
        submission: { submittedAt: at(-MINUTE), late: false, acceptedByTeacher: false, blankCount: 3 },
      },
      { endsAt: at(-MINUTE), endReason: "TIME_EXPIRED" },
    );
    // The first read is still running, its end 2 s ago: the page reads again after the grace.
    setup(<ExamAttempt activityId={exam().id} userId="aluno-1" />, () => (reads++ === 0 ? running(-2_000) : expired));
    expect(await screen.findByText(TIME_OVER, {}, { timeout: 3_000 })).toBeTruthy();
    expect(screen.queryByRole("timer")).toBeNull();
    for (const field of screen.queryAllByRole("textbox")) expect(field).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: "Entregar atividade" })).toBeNull();
  });

  it("018/FR-013 no último minuto cada mudança é salva na hora, sem esperar a pausa da digitação", async () => {
    const { user, calls } = setup(<ExamAttempt activityId={exam().id} userId="aluno-1" />, running(50_000));
    const field = await screen.findByRole("textbox");
    const typedAt = Date.now();
    await user.type(field, "x");
    await waitFor(() => expect(calls.some((call) => call.key === `PUT ${DETAIL}/attempt/answers`)).toBe(true), { timeout: 1_000 });
    const saved = calls.find((call) => call.key === `PUT ${DETAIL}/attempt/answers`)!;
    expect(saved.at - typedAt).toBeLessThan(1_000);
  });

  it("018/US3-5 uma prova encerrada pelo tempo mostra o motivo na página da atividade", async () => {
    const expired = exam(
      {
        status: "SUBMITTED",
        canAnswer: false,
        attempt: { number: 1, startedAt: at(-61 * MINUTE), lastSavedAt: null, answers: [] },
        submission: { submittedAt: at(-MINUTE), late: false, acceptedByTeacher: false, blankCount: 3 },
      },
      { endsAt: at(-MINUTE), endReason: "TIME_EXPIRED" },
    );
    setup(<ActivityAnswering activityId={expired.id} userId="aluno-1" />, expired);
    expect(await screen.findByText(TIME_OVER)).toBeTruthy();
    expect(screen.queryByRole("button", { name: START_EXAM })).toBeNull();
  });
});
