import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecordIntegrityEventsResult, StudentActivity, StudentExam } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { FOCUS_WARNING_TITLE } from "@/components/ui/assessment/focus-violation-warning";
import { ActivityAnswering } from "@/features/student-activities/components/activity-answering";
import { json, studentActivity } from "@/features/student-activities/components/test-fixtures";
import { ON_HOLD } from "../schemas/exam-attempt";
import { ExamAttempt } from "./exam-shell";

// 018/US4 (contracts/web-ui.md, "Warning dialog", "Hold"): the page shows "Aviso n de 3" when the
// server counts an occurrence (never its own count), goes back to fullscreen from the dialog, and on
// the hold takes the questions away for the server's notice, on this page and on the activity's.

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SERVER_NOW = "2026-10-02T12:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(SERVER_NOW) + ms).toISOString();
const MINUTE = 60_000;

const facts = (overrides: Partial<StudentExam> = {}): StudentExam => ({
  durationMinutes: 60,
  inactivityLimitSeconds: 45,
  startDeadline: at(15 * MINUTE),
  endsAt: at(50 * MINUTE),
  occurrences: { count: 0, warningsAllowed: 3 },
  hold: null,
  endReason: null,
  ownOccurrences: [],
  ...overrides,
});
const running = (examFacts: Partial<StudentExam> = {}, overrides: Partial<StudentActivity> = {}) =>
  studentActivity({
    type: "EXAM",
    executionMode: "CONTROLLED",
    title: "Prova de POO",
    deadline: null,
    latePolicy: null,
    totalGrade: "10.00",
    status: "IN_PROGRESS",
    attempt: { number: 1, startedAt: SERVER_NOW, lastSavedAt: null, answers: [] },
    exam: facts(examFacts),
    ...overrides,
  });
const held = () => running({ occurrences: { count: 4, warningsAllowed: 3 }, hold: { openedAt: SERVER_NOW } }, { questions: [] });
const DETAIL = `/api/me/activities/${running().id}`;

function setup(ui: React.ReactElement, detail: () => StudentActivity, count: () => RecordIntegrityEventsResult["exam"]) {
  const sent: { type: string }[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${String(input)}`;
      if (key === `GET ${DETAIL}`) return json(200, detail());
      if (key === `POST ${DETAIL}/attempt/events`) {
        const body = JSON.parse(String(init?.body)) as { events: { eventId: string; type: string }[] };
        sent.push(body.events);
        return json(200, { recorded: body.events.map((event) => ({ eventId: event.eventId, recordedAt: SERVER_NOW })), exam: count() });
      }
      return json(200, {});
    }),
  );
  return { ...renderWithProviders(ui), sent, user: userEvent.setup() };
}

let fullscreenElement: Element | null = null;
function fullscreenDevice() {
  fullscreenElement = document.documentElement;
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  document.documentElement.requestFullscreen = vi.fn(async () => {
    fullscreenElement = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  document.exitFullscreen = vi.fn(async () => {
    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
}
const leaveFullscreen = () =>
  act(() => {
    fullscreenElement = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });

describe("018/US4 avisos e encerramento na página da prova", () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockReset();
    fullscreenDevice();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("018/US4-1 018/FR-017 sair da tela cheia: o servidor conta 1 e a página mostra “Aviso 1 de 3”, sem o aviso da 015", async () => {
    const { user, sent } = setup(<ExamAttempt activityId={running().id} userId="aluno-1" />, () => running(), () => ({ occurrenceCount: 1, held: false }));
    await screen.findByRole("timer");
    leaveFullscreen();
    const dialog = await screen.findByRole("alertdialog", { name: "Aviso 1 de 3" });
    expect(dialog.textContent).toContain("Você saiu da tela cheia. Na 4ª ocorrência a prova será encerrada.");
    expect(sent.flat().map((event) => event.type)).toContain("FULLSCREEN_EXITED");
    expect(screen.queryByText(FOCUS_WARNING_TITLE)).toBeNull();
    await expectNoA11yViolations(document.body);

    await user.click(screen.getByRole("button", { name: "Voltar à prova" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
  });

  it("018/FR-017 um lote que o servidor não contou (agrupado) não mostra aviso novo", async () => {
    const { sent } = setup(<ExamAttempt activityId={running().id} userId="aluno-1" />, () => running({ occurrences: { count: 2, warningsAllowed: 3 } }), () => ({
      occurrenceCount: 2,
      held: false,
    }));
    await screen.findByRole("timer");
    leaveFullscreen();
    await waitFor(() => expect(sent.flat().map((event) => event.type)).toContain("FULLSCREEN_EXITED"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("018/US4-5 018/FR-018 na 4ª ocorrência a página lê a prova de novo: o aviso de encerramento, sem questões nem cronômetro", async () => {
    let onHold = false;
    setup(
      <ExamAttempt activityId={running().id} userId="aluno-1" />,
      () => (onHold ? held() : running({ occurrences: { count: 3, warningsAllowed: 3 } })),
      () => {
        onHold = true;
        return { occurrenceCount: 4, held: true };
      },
    );
    await screen.findByRole("timer");
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
    leaveFullscreen();
    expect(await screen.findByText(ON_HOLD)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(ON_HOLD).not.toMatch(/fraude|\bcola\b|viola[cç][aã]o/i);
  });

  it("018/US4-5 em outro dispositivo, a página da atividade mostra o encerramento em vez de “Continuar a prova”", async () => {
    setup(<ActivityAnswering activityId={held().id} userId="aluno-1" />, held, () => null);
    expect(await screen.findByText(ON_HOLD)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continuar a prova" })).toBeNull();
  });
});
