import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StudentActivity, StudentPause } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ActivityAnswering } from "@/features/student-activities/components/activity-answering";
import { apiError, json, studentActivity } from "@/features/student-activities/components/test-fixtures";
import { formatTime } from "@/lib/messages/dates";
import { CONFIRM_EXIT, EXIT_ROOM, PAUSED_TITLE, RESUME_CONTROLLED, RETURN_RELEASED } from "@/features/attendance/schemas/attendance";
import { PASTE_BLOCKED_MESSAGE } from "../hooks/use-clipboard-block";
import { ControlledAttempt } from "./controlled-attempt";
import { CONTROLLED_NOTICE_TITLE } from "./controlled-start";

// 015/US2 (contracts/web-ui.md): the controlled mode for the student — the notice and the start on
// the activity's page, then the focus page with the warnings, the blocked clipboard and the
// confirmation to leave. Events go to the API with the browser's time; the warning shows the server's.

const router = { push: vi.fn(), replace: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SERVER_TIME = "2026-10-02T17:32:00.000Z";
const controlled = (overrides = {}) => studentActivity({ executionMode: "CONTROLLED", ...overrides });
const started = (overrides = {}) =>
  controlled({ status: "IN_PROGRESS", attempt: { number: 1, startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [] }, ...overrides });
const activity = controlled();
const DETAIL = `/api/me/activities/${activity.id}`;
const EVENTS = `${DETAIL}/attempt/events`;

type Sent = { type: string; questionId?: string; buffered: boolean; eventId: string };

/**
 * The API: the activity (a value, or read on each request), its start and the events (answered with
 * the server's time). A route in `extra` answers before these.
 */
function setup(
  ui: React.ReactElement,
  current: StudentActivity | (() => StudentActivity) = started(),
  extra: Record<string, (init?: RequestInit) => Response> = {},
) {
  const events: Sent[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const override = extra[key];
    if (override) return override(init);
    if (key === `GET ${DETAIL}`) return json(200, typeof current === "function" ? current() : current);
    if (key === `POST ${DETAIL}/attempt`) return json(200, started());
    if (key === `POST ${EVENTS}`) {
      const body = JSON.parse(String(init?.body)) as { events: Sent[] };
      events.push(...body.events);
      return json(200, { recorded: body.events.map((event) => ({ eventId: event.eventId, recordedAt: SERVER_TIME })) });
    }
    return apiError(404, "NOT_FOUND", "x");
  });
  vi.stubGlobal("fetch", fetchMock);
  const view = renderWithProviders(ui);
  return { ...view, events, fetchMock, user: userEvent.setup() };
}
const focusPage = (current: StudentActivity | (() => StudentActivity) = started(), extra: Record<string, (init?: RequestInit) => Response> = {}) =>
  setup(<ControlledAttempt activityId={activity.id} userId="aluno-1" />, current, extra);
const types = (events: Sent[]) => events.map((event) => event.type);

let fullscreenElement: Element | null = null;
function fullscreenDevice(enabled: boolean) {
  fullscreenElement = null;
  Object.defineProperty(document, "fullscreenEnabled", { configurable: true, get: () => enabled });
  Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fullscreenElement });
  const change = (element: Element | null) => {
    fullscreenElement = element;
    document.dispatchEvent(new Event("fullscreenchange"));
  };
  document.documentElement.requestFullscreen = vi.fn(async () => change(document.documentElement));
  document.exitFullscreen = vi.fn(async () => change(null));
  return change;
}

describe("015/US2 aluno responde em modo controlado", () => {
  beforeEach(() => {
    window.localStorage.clear();
    router.push.mockReset();
    router.replace.mockReset();
    fullscreenDevice(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("015/US2-1 015/FR-007 antes de iniciar, o aviso do modo controlado e o início por ação explícita", async () => {
    const { container, user, fetchMock } = setup(<ActivityAnswering activityId={activity.id} userId="aluno-1" />, activity);
    const notice = await screen.findByText(CONTROLLED_NOTICE_TITLE);
    const section = notice.closest("section")!;
    expect(section.textContent).toMatch(/tela cheia/);
    expect(section.textContent).toMatch(/professor vê esses registros/);
    expect(section.textContent).toMatch(/Nada é bloqueado nem entregue sozinho/);
    expect(screen.queryByRole("navigation", { name: "Questões" })).toBeNull();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Iniciar em modo controlado" }));
    // 015/US2-2: fullscreen asked for in the click, then the attempt starts and the focus page opens.
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/minhas-atividades/${activity.id}/responder`));
    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${String(url)}`)).toContain(`POST ${DETAIL}/attempt`);
  });

  it("015/US2-2 tentativa já iniciada: \"Continuar em modo controlado\" volta à página de foco, sem as questões aqui", async () => {
    const { user } = setup(<ActivityAnswering activityId={activity.id} userId="aluno-1" />, started());
    await user.click(await screen.findByRole("button", { name: "Continuar em modo controlado" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/minhas-atividades/${activity.id}/responder`));
    expect(screen.queryByRole("navigation", { name: "Questões" })).toBeNull();
  });

  it("015/US2-3 015/FR-011 trocar de aba e voltar: saída e retorno enviados, aviso com o horário do servidor sem roubar o foco", async () => {
    const { events, container } = focusPage();
    expect(await screen.findByRole("navigation", { name: "Questões" })).toBeTruthy();
    expect(screen.getByText("Modo controlado")).toBeTruthy();
    const before = document.activeElement;
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    hasFocus.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    const warning = await screen.findByText("Você saiu da tela da avaliação");
    const alert = warning.closest("[data-slot=focus-violation-warning]")!;
    await waitFor(() => expect(alert.textContent).toContain(`Este evento foi registrado às ${formatTime(SERVER_TIME)}.`));
    expect(alert.textContent).toContain("Continue respondendo. Se foi um engano, você não precisa fazer nada.");
    expect(document.activeElement).toBe(before);
    expect(types(events)).toEqual(expect.arrayContaining(["SCREEN_LEFT", "SCREEN_RETURNED"]));
    expect(container.textContent).not.toMatch(/fraude|viola|cola\b/i);
    await expectNoA11yViolations(container);
  });

  it("015/US2-4 sair da tela cheia: evento, aviso e \"Voltar para tela cheia\"; responder continua possível", async () => {
    const change = fullscreenDevice(true);
    fullscreenElement = document.documentElement;
    const { events, user } = focusPage();
    await screen.findByRole("navigation", { name: "Questões" });
    act(() => change(null));
    await screen.findByText("Você saiu da tela da avaliação");
    expect(types(events)).toContain("FULLSCREEN_EXITED");
    await user.click(screen.getByRole("button", { name: "Voltar para tela cheia" }));
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    await waitFor(() => expect(types(events)).toContain("FULLSCREEN_ENTERED"));
    expect(screen.getByRole("textbox", { name: /Sua resposta/ })).toBeTruthy();
  });

  it("015/US2-5 015/FR-012 \"Sair\" e o voltar do navegador pedem \"Sair da avaliação?\" e registram a tentativa; fechar usa a confirmação do navegador", async () => {
    const { events, user } = focusPage();
    await screen.findByRole("navigation", { name: "Questões" });
    await user.click(screen.getByRole("button", { name: "Sair" }));
    const dialog = screen.getByRole("alertdialog", { name: "Sair da avaliação?" });
    expect(dialog.textContent).toContain("Sua tentativa continua em andamento.");
    await waitFor(() => expect(types(events)).toEqual(["PAGE_LEAVE_ATTEMPTED"]));
    await user.click(within(dialog).getByRole("button", { name: "Continuar respondendo" }));
    expect(router.push).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("alertdialog", { name: "Sair da avaliação?" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sair da avaliação" }));
    expect(router.push).toHaveBeenCalledWith(`/minhas-atividades/${activity.id}`);

    const unload = new Event("beforeunload", { cancelable: true });
    act(() => {
      window.dispatchEvent(unload);
    });
    expect(unload.defaultPrevented).toBe(true);
    await waitFor(() => expect(types(events).filter((type) => type === "PAGE_LEAVE_ATTEMPTED")).toHaveLength(3));
  });

  it("015/US2-7 sem tela cheia no dispositivo: registra que não estava disponível e o trabalho segue na página", async () => {
    fullscreenDevice(false);
    const { events } = focusPage();
    await screen.findByRole("navigation", { name: "Questões" });
    await waitFor(() => expect(types(events)).toContain("FULLSCREEN_UNAVAILABLE"));
    expect(screen.getByRole("textbox", { name: /Sua resposta/ })).toBeTruthy();
  });

  it("015/US2-10 colar na resposta: nada entra, mensagem junto do campo e evento com a questão", async () => {
    const { events } = focusPage();
    const field = await screen.findByRole("textbox", { name: /Sua resposta/ });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    act(() => {
      field.dispatchEvent(paste);
    });
    expect(paste.defaultPrevented).toBe(true);
    expect(await screen.findByText(PASTE_BLOCKED_MESSAGE)).toBeTruthy();
    await waitFor(() => expect(events.at(-1)).toMatchObject({ type: "PASTE_BLOCKED", questionId: activity.questions[0]!.id }));
  });

  it("015/FR-013c resposta recusada pelo limite de digitação: o texto fica na tela com a mensagem", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const question = activity.questions[0]!;
    focusPage(started(), {
      [`PUT ${DETAIL}/attempt/answers`]: () =>
        json(200, { savedAt: SERVER_TIME, results: [{ questionId: question.id, outcome: "TYPING_LIMIT_EXCEEDED", revision: 0 }] }),
    });
    const field = await screen.findByRole("textbox", { name: /Sua resposta/ });
    fireEvent.change(field, { target: { value: "x".repeat(800) } });
    await act(async () => vi.advanceTimersByTime(2_000));
    expect(await screen.findByText("Esse trecho não foi salvo porque parece ter sido colado. Digite a resposta.")).toBeTruthy();
    expect((field as HTMLTextAreaElement).value).toHaveLength(800);
    vi.useRealTimers();
  });

  it("015/US2-9 um trabalho NORMAL volta para a página da atividade", async () => {
    focusPage(studentActivity({ attempt: { number: 1, startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [] } }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/minhas-atividades/${activity.id}`));
  });

  it("015/FR-014 depois da entrega nada é monitorado nem bloqueado", async () => {
    const { events } = focusPage(
      started({
        status: "SUBMITTED",
        canAnswer: false,
        submission: { submittedAt: "2026-10-02T12:30:00.000Z", late: false, acceptedByTeacher: false, blankCount: 3 },
      }),
    );
    await screen.findByText(/Atividade entregue em/);
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    const copy = new Event("copy", { bubbles: true, cancelable: true });
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      document.body.dispatchEvent(copy);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(copy.defaultPrevented).toBe(false);
    expect(events).toEqual([]);
  });

  it("teclado: \"Sair\" e as questões alcançáveis por Tab; Esc fecha o diálogo e o foco volta a \"Sair\"", async () => {
    const { user } = focusPage();
    await screen.findByRole("navigation", { name: "Questões" });
    const exit = screen.getByRole("button", { name: "Sair" });
    exit.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(exit);
  });
});

describe("015/US3-12 ajuda da IA dentro da página de foco", () => {
  beforeEach(() => {
    window.localStorage.clear();
    fullscreenDevice(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("015/US3-12 015/FR-013a abrir \"Pedir ajuda\" não conta como saída; colar no campo é bloqueado e registrado com a questão", async () => {
    const withHelp = started({ aiHelp: { allowance: 3, used: 0 } });
    const help = () => json(200, { allowance: 3, used: 0, pending: false, items: [] });
    const { events, user } = focusPage(withHelp, { [`GET ${DETAIL}/attempt/help`]: help });
    await user.click(await screen.findByRole("button", { name: "Pedir ajuda" }));
    const dialog = screen.getByRole("dialog", { name: "Pedir ajuda à IA" });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    fireEvent(within(dialog).getByRole("textbox"), paste);
    expect(paste.defaultPrevented).toBe(true);
    expect(within(dialog).getByText(PASTE_BLOCKED_MESSAGE)).toBeTruthy();
    await waitFor(() => expect(events.map((event) => [event.type, event.questionId])).toEqual([["PASTE_BLOCKED", withHelp.questions[0]!.id]]));
    expect(types(events)).not.toContain("SCREEN_LEFT");
    // The header and the question show the same counter.
    expect(screen.getAllByText("Ajudas restantes: 3 de 3")).toHaveLength(2);
  });
});


describe("016/FR-017 saída da sala no modo controlado (research M10)", () => {
  const PAUSE: StudentPause = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1",
    initiatedBy: "STUDENT",
    reason: "WATER",
    note: null,
    startedAt: "2026-10-02T13:42:00.000Z",
    endedAt: null,
  };
  const paused = () => started({ pause: PAUSE, questions: [] });

  beforeEach(() => {
    window.localStorage.clear();
    router.push.mockReset();
    router.replace.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("016/US3-6 016/FR-017 na saída declarada o monitor para antes de sair da tela cheia: monitor parado → autosave e fila enviados → pausa → saída da tela cheia; nenhum SCREEN_LEFT nem FULLSCREEN_EXITED", async () => {
    fullscreenDevice(true);
    fullscreenElement = document.documentElement;
    const order: string[] = [];
    let isPaused = false;
    let eventPosts = 0;
    let eventsDown = true;
    const sentEvents: Sent[] = [];
    const exitFullscreen = document.exitFullscreen as ReturnType<typeof vi.fn>;
    exitFullscreen.mockImplementation(async () => {
      order.push("tela cheia encerrada");
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    const { user } = focusPage(() => (isPaused ? paused() : started()), {
      [`PUT ${DETAIL}/attempt/answers`]: (init) => {
        order.push("autosave");
        const body = JSON.parse(String(init?.body)) as { answers: { questionId: string }[] };
        return json(200, { savedAt: SERVER_TIME, results: body.answers.map((item) => ({ questionId: item.questionId, outcome: "SAVED", revision: 1 })) });
      },
      [`POST ${EVENTS}`]: (init) => {
        // Down until the exit: the batches wait in the queue, and the exit sends them.
        eventPosts += 1;
        if (eventsDown) return apiError(503, "SERVICE_UNAVAILABLE", "x");
        order.push("fila de eventos");
        const body = JSON.parse(String(init?.body)) as { events: Sent[] };
        sentEvents.push(...body.events);
        return json(200, { recorded: body.events.map((event) => ({ eventId: event.eventId, recordedAt: SERVER_TIME })) });
      },
      [`POST ${DETAIL}/attempt/pause`]: () => {
        // A screen exit now would be recorded if the monitor were still on.
        window.dispatchEvent(new Event("blur"));
        order.push(document.fullscreenElement ? "pausa (ainda em tela cheia)" : "pausa (fora da tela cheia)");
        isPaused = true;
        return json(201, PAUSE);
      },
      [`GET ${DETAIL}/attempt/pause`]: () => json(200, { pause: isPaused ? PAUSE : null }),
    });
    await screen.findByRole("navigation", { name: "Questões" });
    // One exit and return that couldn't be sent yet (503): queued in this browser.
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    hasFocus.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await waitFor(() => expect(eventPosts).toBeGreaterThan(0));
    // An answer typed and not saved yet.
    await user.type(screen.getByRole("textbox", { name: /Sua resposta/ }), "Protege o estado");
    hasFocus.mockReturnValue(false);

    await user.click(screen.getByRole("button", { name: EXIT_ROOM }));
    await user.click(screen.getByRole("radio", { name: "Beber água" }));
    eventsDown = false;
    await user.click(screen.getByRole("button", { name: CONFIRM_EXIT }));

    expect(await screen.findByText(PAUSED_TITLE)).toBeTruthy();
    expect(order).toEqual(["autosave", "fila de eventos", "pausa (ainda em tela cheia)", "tela cheia encerrada"]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(types(sentEvents)).toEqual(["SCREEN_LEFT", "SCREEN_RETURNED"]);
    // Nothing waits in this browser either.
    const stored = Object.keys(window.localStorage).map((key) => window.localStorage.getItem(key) ?? "");
    expect(stored.join("\n")).not.toMatch(/SCREEN_LEFT|FULLSCREEN_EXITED/);
    expect(screen.queryByRole("navigation", { name: "Questões" })).toBeNull();
  });

  it("016/US3-6 016/FR-017 na retomada, \"Retomar em modo controlado\" pede a tela cheia pelo gesto e as questões voltam", async () => {
    fullscreenDevice(true);
    let isPaused = true;
    const { user, events } = focusPage(() => (isPaused ? paused() : started()), {
      [`GET ${DETAIL}/attempt/pause`]: () => {
        isPaused = false;
        return json(200, { pause: null });
      },
    });
    expect(await screen.findByText(RETURN_RELEASED)).toBeTruthy();
    expect(document.documentElement.requestFullscreen).not.toHaveBeenCalled();
    // While paused nothing is monitored: leaving the screen records nothing.
    expect(types(events)).toEqual([]);
    await user.click(screen.getByRole("button", { name: RESUME_CONTROLLED }));
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledOnce();
    expect(await screen.findByRole("navigation", { name: "Questões" })).toBeTruthy();
  });
});
