import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { readPendingAnswers } from "../store/pending-answers";
import { ActivityAnswering, CONFLICT_ALERT, DEADLINE_WARNINGS, OFFLINE_ALERT } from "./activity-answering";
import { apiError, json, routedFetch, studentActivity } from "./test-fixtures";

// 012/US3 — the answering screen: start, answer each type, navigate, autosave status, offline and
// conflict alerts, refusals with the API's reason, deadline warnings from the server clock.

const activity = studentActivity();
const [open, multiple, code] = activity.questions as [
  (typeof activity.questions)[number],
  (typeof activity.questions)[number],
  (typeof activity.questions)[number],
];
const GET = `GET /api/me/activities/${activity.id}`;
const START = `POST /api/me/activities/${activity.id}/attempt`;
const SAVE = `PUT /api/me/activities/${activity.id}/attempt/answers`;
const started = (overrides = {}) =>
  studentActivity({
    status: "IN_PROGRESS",
    attempt: { startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [] },
    ...overrides,
  });
const saved = (questionId: string, revision = 1) =>
  json(200, { savedAt: "2026-10-02T12:00:00.000Z", results: [{ questionId, outcome: "SAVED", revision }] });

function setup(routes: Parameters<typeof routedFetch>[0]) {
  const api = routedFetch(routes);
  vi.stubGlobal("fetch", vi.fn(api.fetch));
  const view = renderWithProviders(<ActivityAnswering activityId={activity.id} userId="aluno-1" />);
  return { ...view, api, user: userEvent.setup() };
}

describe("012/US3 tela de responder a atividade", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // TanStack Query's online manager is global: leave it online for the next test.
    window.dispatchEvent(new Event("online"));
  });

  it("012/US3-1 cabeçalho da atividade e \"Iniciar atividade\" leva às questões", async () => {
    const { user, api, container } = setup({ [GET]: json(200, activity), [START]: json(200, started()) });
    expect(await screen.findByRole("heading", { level: 1, name: "Lista de herança" })).toBeTruthy();
    expect(screen.getByText("Ana Professora")).toBeTruthy();
    expect(screen.getByText("Responda com suas palavras.")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Questões" })).toBeNull();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Iniciar atividade" }));
    expect(await screen.findByRole("navigation", { name: "Questões" })).toBeTruthy();
    expect(api.calls.map((call) => `${call.method} ${call.url}`)).toContain(START);
    expect(screen.getByText("Questão 1 de 3")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Questão 1" })).toBeTruthy();
    expect(screen.getByText("Pergunta e resposta · Vale 0,40")).toBeTruthy();
    expect(screen.getByText("Explique encapsulamento.")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("recusa ao iniciar mostra o motivo da API", async () => {
    const { user } = setup({
      [GET]: json(200, activity),
      [START]: apiError(409, "DEADLINE_PASSED", "x"),
    });
    await user.click(await screen.findByRole("button", { name: "Iniciar atividade" }));
    expect(
      await screen.findByText("O prazo desta atividade terminou e ela não aceita entrega atrasada. Suas respostas salvas continuam guardadas."),
    ).toBeTruthy();
  });

  it("sem poder responder e sem tentativa: aviso, sem botão de iniciar", async () => {
    setup({ [GET]: json(200, studentActivity({ status: "OVERDUE", canAnswer: false })) });
    expect(await screen.findByText("Esta atividade não aceita mais respostas.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Iniciar atividade" })).toBeNull();
  });

  it("012/US3-3 012/FR-022 responder, trocar de questão salva e marca a questão como respondida", async () => {
    const { user, api } = setup({
      [GET]: json(200, started()),
      [SAVE]: saved(open.id),
    });
    const field = await screen.findByLabelText("Sua resposta");
    await user.type(field, "Esconder o estado");
    await user.click(screen.getByRole("button", { name: "Próxima" }));

    expect(screen.getByRole("heading", { level: 2, name: "Questão 2" })).toBe(document.activeElement);
    await vi.waitFor(() => expect(api.calls.filter((call) => call.method === "PUT")).toHaveLength(1));
    const navigator = screen.getByRole("navigation", { name: "Questões" });
    expect(within(navigator).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Questão 1, respondida",
      "Questão 2, atual, não respondida",
      "Questão 3, não respondida",
    ]);
    expect(await screen.findByText("Resposta salva")).toBeTruthy();
    expect(screen.getByText("1 de 3 respondidas")).toBeTruthy();

    // Multiple choice by keyboard-reachable radios; code with the starter code and the public cases.
    await user.click(screen.getByText("Uma instância de uma classe."));
    expect((screen.getByRole("radio", { name: /Uma instância/ }) as HTMLInputElement).checked).toBe(true);
    await user.click(within(navigator).getByRole("button", { name: "Questão 3, não respondida" }));
    expect((screen.getByLabelText("Seu código (Java)") as HTMLTextAreaElement).value).toBe("class Main {}");
    expect(screen.getByText("Leia dois inteiros.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Casos de teste públicos" })).toBeTruthy();
  });

  it("012/US3-3 respostas salvas voltam na tela ao recarregar", async () => {
    setup({
      [GET]: json(
        200,
        started({
          attempt: {
            startedAt: "2026-10-02T11:00:00.000Z",
            lastSavedAt: "2026-10-02T11:30:00.000Z",
            answers: [{ questionId: open.id, answer: { kind: "TEXT", text: "salva antes" }, revision: 2 }],
          },
        }),
      ),
    });
    expect(((await screen.findByLabelText("Sua resposta")) as HTMLTextAreaElement).value).toBe("salva antes");
    expect(screen.getByText("1 de 3 respondidas")).toBeTruthy();
  });

  it("012/US3-5 012/SC-005 sem conexão: aviso, resposta na tela e guardada no navegador", async () => {
    const { user, api } = setup({ [GET]: json(200, started()) });
    const field = await screen.findByLabelText("Sua resposta");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText(OFFLINE_ALERT)).toBeTruthy();
    await user.type(field, "offline");
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(api.calls.filter((call) => call.method === "PUT")).toHaveLength(0);
    expect(readPendingAnswers("aluno-1", activity.id)).toEqual([{ questionId: open.id, answer: { kind: "TEXT", text: "offline" }, baseRevision: 0 }]);
  });

  it("012/US3-6 falha ao salvar: texto oficial e \"Tentar novamente\" reenvia", async () => {
    let calls = 0;
    const { user, api } = setup({
      [GET]: json(200, started()),
      [SAVE]: () => (++calls === 1 ? apiError(500, "INTERNAL_ERROR", "x") : saved(open.id)),
    });
    await user.type(await screen.findByLabelText("Sua resposta"), "texto");
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Não foi possível salvar. Sua resposta continua na tela; tentaremos de novo.");
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    await vi.waitFor(() => expect(api.calls.filter((call) => call.method === "PUT")).toHaveLength(2));
    expect(await screen.findByText("Resposta salva")).toBeTruthy();
  });

  it("recusa ao salvar (prazo encerrado) mostra o motivo e mantém a resposta", async () => {
    const { user } = setup({ [GET]: json(200, started()), [SAVE]: apiError(409, "DEADLINE_PASSED", "x") });
    const field = (await screen.findByLabelText("Sua resposta")) as HTMLTextAreaElement;
    await user.type(field, "guardada");
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText(/O prazo desta atividade terminou/)).toBeTruthy();
    expect(screen.getByText("Suas respostas continuam na tela.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect((screen.getByLabelText("Sua resposta") as HTMLTextAreaElement).value).toBe("guardada");
  });

  it("conflito com outra aba: aviso e a versão do servidor na tela", async () => {
    const { user } = setup({
      [GET]: json(200, started()),
      [SAVE]: json(200, {
        savedAt: "2026-10-02T12:00:00.000Z",
        results: [{ questionId: open.id, outcome: "CONFLICT", revision: 3, answer: { kind: "TEXT", text: "da outra aba" } }],
      }),
    });
    await user.type(await screen.findByLabelText("Sua resposta"), "desta aba");
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText(CONFLICT_ALERT)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect((screen.getByLabelText("Sua resposta") as HTMLTextAreaElement).value).toBe("da outra aba");
  });

  it("avisos de prazo aos 10 e a 1 minuto pelo relógio do servidor", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const deadline = "2026-10-02T12:10:30.000Z";
    setup({ [GET]: json(200, started({ deadline, serverNow: "2026-10-02T12:00:00.000Z" })) });
    await screen.findByRole("navigation", { name: "Questões" });
    expect(screen.queryByText(DEADLINE_WARNINGS[10])).toBeNull();
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByText(DEADLINE_WARNINGS[10])).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(9 * 60_000));
    expect(screen.queryByText(DEADLINE_WARNINGS[10])).toBeNull();
    expect(screen.getByText(DEADLINE_WARNINGS[1])).toBeTruthy();
  });

  it("012/SC-005 012/FR-022 navegação por teclado: questões, resposta e rodapé, sem violações", async () => {
    const { user, container } = setup({ [GET]: json(200, started()) });
    const field = await screen.findByLabelText("Sua resposta");
    const buttons = within(screen.getByRole("navigation", { name: "Questões" })).getAllByRole("button");
    await expectTabOrder(user, [...buttons, field, screen.getByRole("button", { name: "Próxima" })]);
    fireEvent.keyDown(buttons[0]!, { key: "End" });
    expect(document.activeElement).toBe(buttons[2]);
    await expectNoA11yViolations(container);
  });

  it("012/US3-7 nada de gabarito: a tela só mostra o que a API manda (texto como texto)", async () => {
    setup({
      [GET]: json(200, started({ questions: [{ ...open, statement: "<img src=x onerror=alert(1)>" }, multiple, code] })),
    });
    expect(await screen.findByText("<img src=x onerror=alert(1)>", { selector: '[data-slot="question-statement"]' })).toBeTruthy();
    expect(document.querySelector("img")).toBeNull();
  });
});
