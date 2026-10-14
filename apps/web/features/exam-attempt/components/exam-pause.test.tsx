import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentActivity, StudentExam, StudentPause } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { apiError, json, studentActivity } from "@/features/student-activities/components/test-fixtures";
import { EXAM_PAUSED, TIME_OVER } from "../schemas/exam-attempt";
import { ExamAttempt } from "./exam-shell";

// 018/US6 (contracts/web-ui.md, "Student"): only the teacher pauses an exam. The focus page shows
// "Prova pausada pelo professor. O tempo continua correndo." with no question, keeps the server's
// timer, offers no "Sair da sala", and reads the exam again when the time is over.

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SERVER_NOW = "2026-10-02T12:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(SERVER_NOW) + ms).toISOString();
const MINUTE = 60_000;

const examFacts = (endsAt: string): StudentExam => ({
  durationMinutes: 60,
  inactivityLimitSeconds: 45,
  startDeadline: at(15 * MINUTE),
  endsAt,
  occurrences: { count: 0, warningsAllowed: 3 },
  hold: null,
  endReason: null,
  ownOccurrences: [],
});
const teacherPause: StudentPause = { id: "pausa-1", initiatedBy: "TEACHER", reason: "TEACHER", note: null, startedAt: at(-MINUTE), endedAt: null };
/** Started a while ago, ending `leftMs` after the server's now. */
const running = (leftMs: number, overrides: Partial<StudentActivity> = {}) =>
  studentActivity({
    type: "EXAM",
    executionMode: "CONTROLLED",
    title: "Prova de POO",
    deadline: null,
    latePolicy: null,
    totalGrade: "10.00",
    status: "IN_PROGRESS",
    attempt: { number: 1, startedAt: at(-10 * MINUTE), lastSavedAt: null, answers: [] },
    exam: examFacts(at(leftMs)),
    ...overrides,
  });
/** The same exam paused by the teacher: the server sends no question nor answer. */
const paused = (leftMs: number) => running(leftMs, { pause: teacherPause, questions: [], attempt: { number: 1, startedAt: at(-10 * MINUTE), lastSavedAt: null, answers: [] } });
const DETAIL = `/api/me/activities/${running(0).id}`;

function setup(current: () => StudentActivity, pause: () => StudentPause | null) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    calls.push(key);
    if (key === `GET ${DETAIL}`) return json(200, current());
    if (key === `GET ${DETAIL}/attempt/pause`) return json(200, { pause: pause() });
    if (key === `POST ${DETAIL}/attempt/events`) {
      const body = JSON.parse(String(init?.body)) as { events: { eventId: string }[] };
      return json(200, { recorded: body.events.map((event) => ({ eventId: event.eventId, recordedAt: SERVER_NOW })), exam: null });
    }
    return apiError(404, "NOT_FOUND", "x");
  });
  vi.stubGlobal("fetch", fetchMock);
  return { ...renderWithProviders(<ExamAttempt activityId={running(0).id} userId="aluno-1" />), calls, user: userEvent.setup() };
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

describe("018/US6 o professor pausa o aluno que precisa sair da sala", () => {
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

  it("018/US6-1 a pausa do professor chega pela sondagem: o aviso da prova, sem questões, e o cronômetro segue", async () => {
    let reads = 0;
    const { container } = setup(
      () => (reads++ === 0 ? running(20 * MINUTE) : paused(20 * MINUTE)),
      () => teacherPause,
    );
    expect(await screen.findByText(EXAM_PAUSED)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Questões" })).toBeNull();
    // The time keeps running: the server's timer stays in the header.
    expect(screen.getByRole("timer", { name: "Tempo restante" }).textContent).toBe("20:00 restantes");
    expect(screen.queryByRole("button", { name: "Sair da sala" })).toBeNull();
    expect(container.textContent).not.toMatch(/fraude|\bcola\b|viola/i);
    await expectNoA11yViolations(container);
  });

  it("018/US6-5 018/FR-026 na prova não existe \"Sair da sala\": só o professor pausa", async () => {
    setup(
      () => running(20 * MINUTE),
      () => null,
    );
    await screen.findByRole("timer");
    expect(await screen.findAllByRole("textbox")).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Sair da sala" })).toBeNull();
  });

  it("018/US6-3 o tempo acaba na pausa: a página lê a prova de novo e mostra \"Tempo esgotado\"", async () => {
    let reads = 0;
    const expired = running(-MINUTE, {
      status: "SUBMITTED",
      canAnswer: false,
      submission: { submittedAt: at(-MINUTE), late: false, acceptedByTeacher: false, blankCount: 3 },
      exam: { ...examFacts(at(-MINUTE)), endReason: "TIME_EXPIRED" },
    });
    // Paused when its end was 2 s ago: the page reads again after the grace, and the server settled it.
    setup(
      () => (reads++ === 0 ? paused(-2_000) : expired),
      () => teacherPause,
    );
    expect(await screen.findByText(TIME_OVER, {}, { timeout: 3_000 })).toBeTruthy();
    expect(screen.queryByText(EXAM_PAUSED)).toBeNull();
  });

  it("018/US6-4 liberado o retorno com tempo restante: \"Retomar\" pelo teclado volta à tela cheia e às questões", async () => {
    let reads = 0;
    const { user } = setup(
      () => (reads++ === 0 ? paused(18 * MINUTE) : running(18 * MINUTE)),
      () => null,
    );
    expect(await screen.findByText(EXAM_PAUSED)).toBeTruthy();
    const resume = await screen.findByRole("button", { name: "Retomar" });
    resume.focus();
    await user.keyboard("{Enter}");
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByText(EXAM_PAUSED)).toBeNull());
    expect(await screen.findAllByRole("textbox")).not.toHaveLength(0);
  });
});
