import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { RecordIntegrityEventsResult, StudentActivity, StudentExam, StudentExamNudge } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { json, studentActivity } from "@/features/student-activities/components/test-fixtures";
import { NUDGE_TITLE } from "@/features/exam-nudge/schemas/exam-nudge";
import { ExamAttempt } from "./exam-shell";

// 025/US2 (contracts/ui.md, research N7, N8): the exam page polls the teacher's discreet warning every 5 s while the
// exam runs and the page is visible, shows it after any "Aviso n de 3", closes it at once on "Entendi" and sends the
// dismissal in the background until accepted; it is never an occurrence, never touches fullscreen and suspends the
// inactivity while open.

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SERVER_NOW = "2026-10-02T12:00:00.000Z";
const at = (ms: number) => new Date(Date.parse(SERVER_NOW) + ms).toISOString();
const MINUTE = 60_000;
const NUDGE_ID = "00000000-0000-4000-8000-000000000901";
const SHOWN: StudentExamNudge = { nudge: { id: NUDGE_ID, studentName: "Ana Souza" } };
const NONE: StudentExamNudge = { nudge: null };
const TEXT = "Ana Souza, o professor está acompanhando suas ações. Não tente fazer algo que possa prejudicar sua nota.";

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
const paused = () =>
  running({}, { pause: { id: "pausa-1", initiatedBy: "TEACHER", reason: "TEACHER", note: null, startedAt: at(-MINUTE), endedAt: null }, questions: [] });
const DETAIL = `/api/me/activities/${running().id}`;
const NUDGE = `${DETAIL}/attempt/exam-nudge`;
const DISMISS = `${NUDGE}/${NUDGE_ID}/dismiss`;

interface Scenario {
  detail?: () => StudentActivity;
  nudge?: () => StudentExamNudge;
  dismiss?: () => Response | Promise<Response>;
  count?: () => RecordIntegrityEventsResult["exam"];
}

function setup({ detail = () => running(), nudge = () => SHOWN, dismiss = () => json(200, NONE), count = () => ({ occurrenceCount: 0, held: false }) }: Scenario) {
  const calls: string[] = [];
  const sent: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${String(input)}`;
      calls.push(key);
      if (key === `GET ${DETAIL}`) return json(200, detail());
      if (key === `GET ${NUDGE}`) return json(200, nudge());
      if (key === `POST ${DISMISS}`) {
        expect(JSON.parse(String(init?.body))).toEqual({});
        return dismiss();
      }
      if (key === `GET ${DETAIL}/attempt/pause`) return json(200, { pause: null });
      if (key === `POST ${DETAIL}/attempt/events`) {
        const body = JSON.parse(String(init?.body)) as { events: { eventId: string; type: string }[] };
        sent.push(...body.events.map((event) => event.type));
        return json(200, { recorded: body.events.map((event) => ({ eventId: event.eventId, recordedAt: SERVER_NOW })), exam: count() });
      }
      return json(200, {});
    }),
  );
  renderWithProviders(<ExamAttempt activityId={running().id} userId="aluno-1" />);
  return {
    calls,
    sent,
    polls: () => calls.filter((call) => call === `GET ${NUDGE}`).length,
    dismissals: () => calls.filter((call) => call === `POST ${DISMISS}`).length,
  };
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

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
const setVisibility = (state: DocumentVisibilityState) =>
  act(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
    document.dispatchEvent(new Event("visibilitychange"));
  });

describe("025/US2 o aviso do professor na página da prova", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    router.replace.mockReset();
    fullscreenDevice();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("025/US2-1 025/US2-5 depois de uma consulta de 5 s, “Mensagem do professor” com o texto exato e o nome; o cronômetro segue visível", async () => {
    let sent = false;
    const page = setup({ nudge: () => (sent ? SHOWN : NONE) });
    await screen.findByRole("timer");
    await waitFor(() => expect(page.polls()).toBe(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    sent = true;
    await advance(5_000);
    const dialog = await screen.findByRole("alertdialog", { name: NUDGE_TITLE });
    expect(dialog.textContent).toContain(TEXT);
    expect(screen.getByRole("timer")).toBeTruthy();
  });

  it("025/US2-2 025/US2-4 “Entendi” fecha na hora e chama o fechamento; a tela cheia não é tocada e nenhum evento é gravado pelo aviso", async () => {
    const page = setup({});
    await screen.findByRole("alertdialog", { name: NUDGE_TITLE });
    vi.useRealTimers();
    await userEvent.setup().click(screen.getByRole("button", { name: "Entendi" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(page.dismissals()).toBe(1));
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
    expect(page.sent).toEqual([]);
  });

  it("025/US2-2 Escape faz o mesmo que “Entendi”", async () => {
    const page = setup({});
    await screen.findByRole("alertdialog", { name: NUDGE_TITLE });
    vi.useRealTimers();
    await userEvent.setup().keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(page.dismissals()).toBe(1));
  });

  it("025/FR-011 sem rede: o diálogo fechado não volta, a prova segue respondível e o fechamento é reenviado até dar 200", async () => {
    let online = false;
    const page = setup({ dismiss: () => (online ? json(200, NONE) : Promise.reject(new TypeError("Failed to fetch"))) });
    await screen.findByRole("alertdialog", { name: NUDGE_TITLE });
    await act(async () => {
      screen.getByRole("button", { name: "Entendi" }).click();
    });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(page.dismissals()).toBe(1));
    expect(JSON.parse(window.sessionStorage.getItem("devtrack:avisos-fechados") ?? "[]")).toEqual([NUDGE_ID]);

    // The poll still brings the same warning: it does not reopen; the questions stay answerable.
    const polls = page.polls();
    await advance(5_000);
    expect(page.polls()).toBeGreaterThan(polls);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getAllByRole("textbox")[0]!.hasAttribute("disabled")).toBe(false);
    expect(page.dismissals()).toBe(2);

    online = true;
    await advance(5_000);
    expect(page.dismissals()).toBe(3);
    await advance(15_000);
    expect(page.dismissals()).toBe(3);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("025/FR-011 um aviso já fechado neste aparelho (sessionStorage) não reabre depois de recarregar", async () => {
    window.sessionStorage.setItem("devtrack:avisos-fechados", JSON.stringify([NUDGE_ID]));
    const page = setup({});
    await screen.findByRole("timer");
    await waitFor(() => expect(page.polls()).toBe(1));
    await advance(5_000);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("025/US2-3 com o diálogo aberto, a consulta seguinte volta null (fechado em outra aba): o diálogo some sem chamar o fechamento", async () => {
    let pending = true;
    const page = setup({ nudge: () => (pending ? SHOWN : NONE) });
    await screen.findByRole("alertdialog", { name: NUDGE_TITLE });
    pending = false;
    await advance(5_000);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(page.dismissals()).toBe(0);
  });

  it("025/US2-5 o tempo acaba com o diálogo aberto: a prova se encerra e o diálogo some", async () => {
    let over = false;
    const page = setup({ detail: () => (over ? running({ endsAt: at(20_000) }, { canAnswer: false }) : running({ endsAt: at(20_000) })) });
    await screen.findByRole("alertdialog", { name: NUDGE_TITLE });
    expect(screen.getByRole("timer")).toBeTruthy();
    over = true;
    await advance(25_000);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(page.dismissals()).toBe(0);
  });

  it("025/US2-6 retida com o diálogo aberto: some, sem fechamento, e a consulta para", async () => {
    let hold = false;
    const page = setup({ detail: () => (hold ? held() : running()), count: () => ({ occurrenceCount: 4, held: true }) });
    await screen.findByRole("alertdialog", { name: NUDGE_TITLE });
    hold = true;
    await leaveFullscreen();
    await waitFor(() => expect(screen.queryByRole("alertdialog", { name: NUDGE_TITLE })).toBeNull());
    const polls = page.polls();
    await advance(15_000);
    expect(page.polls()).toBe(polls);
    expect(page.dismissals()).toBe(0);
  });

  it.each([
    ["pausada", paused],
    ["retida", held],
  ])("025/US2-6 %s: nenhuma consulta e nenhum diálogo", async (_label, detail) => {
    const page = setup({ detail });
    await waitFor(() => expect(page.calls).toContain(`GET ${DETAIL}`));
    await advance(1_000);
    await advance(15_000);
    expect(page.polls()).toBe(0);
    expect(screen.queryByRole("alertdialog", { name: NUDGE_TITLE })).toBeNull();
  });

  it("025/US2-6 espera o “Aviso n de 3” fechar e então mostra a mensagem do professor", async () => {
    let sent = false;
    setup({ nudge: () => (sent ? SHOWN : NONE), count: () => ({ occurrenceCount: 1, held: false }) });
    await screen.findByRole("timer");
    await leaveFullscreen();
    await screen.findByRole("alertdialog", { name: "Aviso 1 de 3" });
    sent = true;
    await advance(5_000);
    expect(screen.queryByRole("alertdialog", { name: NUDGE_TITLE })).toBeNull();

    vi.useRealTimers();
    await userEvent.setup().click(screen.getByRole("button", { name: "Voltar à prova" }));
    expect(await screen.findByRole("alertdialog", { name: NUDGE_TITLE })).toBeTruthy();
  });

  it("025/US2-4 com o diálogo aberto além do limite nenhuma INACTIVITY; ao fechar o período recomeça", async () => {
    const page = setup({});
    await screen.findByRole("alertdialog", { name: NUDGE_TITLE });
    await advance(60_000);
    expect(page.sent).not.toContain("INACTIVITY");

    await act(async () => {
      screen.getByRole("button", { name: "Entendi" }).click();
    });
    await advance(30_000);
    expect(page.sent).not.toContain("INACTIVITY");
    await advance(20_000);
    await waitFor(() => expect(page.sent).toContain("INACTIVITY"));
  });

  it("025/US2-8 a consulta só com a página visível (refetchIntervalInBackground: false)", async () => {
    const page = setup({ nudge: () => NONE });
    await screen.findByRole("timer");
    await waitFor(() => expect(page.polls()).toBe(1));
    await setVisibility("hidden");
    await advance(20_000);
    expect(page.polls()).toBe(1);
  });

  it.each(["dark", "light"])("025/US2-8 o diálogo na prova sem violações de acessibilidade no tema %s", async (theme) => {
    document.documentElement.dataset.theme = theme;
    try {
      setup({});
      await screen.findByRole("alertdialog", { name: NUDGE_TITLE });
      vi.useRealTimers();
      await expectNoA11yViolations(document.body);
    } finally {
      delete document.documentElement.dataset.theme;
    }
  });
});
