import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentActivity, StudentExam } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ActivityAnswering } from "@/features/student-activities/components/activity-answering";
import { json, studentActivity } from "@/features/student-activities/components/test-fixtures";
import { CANCELLED_BY_TEACHER, DECIDED_BEFORE_RELEASE, ON_HOLD } from "../schemas/exam-attempt";
import { ExamAttempt } from "./exam-shell";

// 018/US5 on the student's side (contracts/web-ui.md, "Hold", "Decided after a hold"): on hold the
// page reads the exam every 5 s; a return shows "O professor devolveu a sua prova. Restam n minutos."
// with "Retomar", back to fullscreen on the click; the teacher's decision is never shown before the
// release ("Prova encerrada…" for both), and a cancellation shows only once released.

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
  occurrences: { count: 4, warningsAllowed: 3 },
  hold: null,
  endReason: null,
  ownOccurrences: [],
  ...overrides,
});
const exam = (examFacts: Partial<StudentExam> = {}, overrides: Partial<StudentActivity> = {}) =>
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
const held = () => exam({ hold: { openedAt: SERVER_NOW } }, { questions: [] });
const ended = (endReason: StudentExam["endReason"], overrides: Partial<StudentActivity> = {}) =>
  exam({ endReason }, { canAnswer: false, status: "SUBMITTED", submission: { submittedAt: SERVER_NOW, late: false, acceptedByTeacher: false, blankCount: 0 }, ...overrides });
const DETAIL = `/api/me/activities/${exam().id}`;

function setup(ui: React.ReactElement, detail: () => StudentActivity) {
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${String(input)}`;
      if (key === `GET ${DETAIL}`) {
        reads += 1;
        return json(200, detail());
      }
      return json(200, {});
    }),
  );
  return { ...renderWithProviders(ui), reads: () => reads };
}

function fullscreenDevice() {
  let element: Element | null = null;
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => true });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => element });
  document.documentElement.requestFullscreen = vi.fn(async () => {
    element = document.documentElement;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
}

describe("018/US5 a decisão do professor na página da prova", () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.replace.mockReset();
    fullscreenDevice();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("018/US5-2 018/SC-007 retida, a página lê a prova a cada 5 s; devolvida, mostra o tempo restante e “Retomar” volta à tela cheia", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let returned = false;
    const { reads } = setup(<ExamAttempt activityId={exam().id} userId="aluno-1" />, () => (returned ? exam() : held()));
    expect(await screen.findByText(ON_HOLD)).toBeTruthy();
    const before = reads();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(reads()).toBeGreaterThan(before);
    expect(screen.getByText(ON_HOLD)).toBeTruthy();

    returned = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(await screen.findByText("O professor devolveu a sua prova. Restam 50 minutos.")).toBeTruthy();
    expect(screen.queryByText(ON_HOLD)).toBeNull();
    expect(screen.getByRole("timer")).toBeTruthy();
    await expectNoA11yViolations(document.body);

    vi.useRealTimers();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retomar" }));
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    expect(screen.queryByText(/O professor devolveu a sua prova/)).toBeNull();
  });

  it("018/US5-1 018/US5-5 018/FR-029 antes da liberação, cancelada ou não, o aluno vê só “Prova encerrada…”", async () => {
    setup(<ActivityAnswering activityId={exam().id} userId="aluno-1" />, () => ended("WARNINGS"));
    expect(await screen.findByText(DECIDED_BEFORE_RELEASE)).toBeTruthy();
    expect(screen.queryByText(CANCELLED_BY_TEACHER)).toBeNull();
    expect(DECIDED_BEFORE_RELEASE).not.toMatch(/cancel|zero/i);
  });

  it("018/FR-029 depois da liberação, o cancelamento aparece: “Prova cancelada pelo professor.”", async () => {
    const result = { grade: "0.00", generalFeedback: null, questions: [] };
    setup(<ActivityAnswering activityId={exam().id} userId="aluno-1" />, () => ended("CANCELLED", { result }));
    expect(await screen.findByText(CANCELLED_BY_TEACHER)).toBeTruthy();
    expect(screen.queryByText(DECIDED_BEFORE_RELEASE)).toBeNull();
  });
});
