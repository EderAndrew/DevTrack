import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { codeMirrorContent, codeMirrorText, syntaxSegments, typeCode } from "../../../test/code-editor";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { readPendingAnswers, writePendingAnswers } from "../store/pending-answers";
import {
  ActivityAnswering,
  CHANGED_ELSEWHERE,
  COMPLETE_CONFIRMATION,
  CONFLICT_ALERT,
  DEADLINE_WARNINGS,
  OFFLINE_ALERT,
  SUBMIT_CONFIRMATION,
} from "./activity-answering";
import { apiError, exerciseActivity, exerciseAttempt, json, routedFetch, studentActivity } from "./test-fixtures";

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
const SUBMIT = `POST /api/me/activities/${activity.id}/attempt/submit`;
const submitted = (overrides = {}) =>
  started({
    status: "SUBMITTED",
    canAnswer: false,
    submittedAt: "2026-10-02T12:30:00.000Z",
    submission: { submittedAt: "2026-10-02T12:30:00.000Z", late: false, acceptedByTeacher: false, blankCount: 2 },
    ...overrides,
  });
const started = (overrides = {}) =>
  studentActivity({
    status: "IN_PROGRESS",
    attempt: { number: 1, startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [] },
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
    expect(codeMirrorText(await codeMirrorContent())).toBe("class Main {}");
    expect(screen.getByRole("textbox", { name: "Sua resposta (Java)" })).toBeTruthy();
    expect(screen.getByText("Leia dois inteiros.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Casos de teste públicos" })).toBeTruthy();
  });

  it("012/US3-3 respostas salvas voltam na tela ao recarregar", async () => {
    setup({
      [GET]: json(
        200,
        started({
          attempt: {
            number: 1,
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

  describe("012/US4 entregar a atividade", () => {
    it("012/US4-4 012/FR-023 confirmação com o texto oficial e as questões em branco; Voltar às questões não entrega", async () => {
      const { user, api, container } = setup({ [GET]: json(200, started()) });
      await user.click(await screen.findByRole("button", { name: "Entregar atividade" }));
      const dialog = await screen.findByRole("alertdialog");
      expect(within(dialog).getByText(SUBMIT_CONFIRMATION)).toBeTruthy();
      expect(within(dialog).getByText("3 questões em branco.")).toBeTruthy();
      await expectNoA11yViolations(container.ownerDocument.body);
      await user.click(within(dialog).getByRole("button", { name: "Voltar às questões" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(api.calls.filter((call) => call.method === "POST")).toHaveLength(0);
    });

    it("012/US4-1 012/FR-026 entrega com as respostas pendentes: confirmação com data e hora, somente leitura, cópia local apagada", async () => {
      const { user, api } = setup({ [GET]: json(200, started()), [SUBMIT]: json(200, submitted()) });
      await user.type(await screen.findByLabelText("Sua resposta"), "na entrega");
      await user.click(screen.getByRole("button", { name: "Entregar atividade" }));
      expect(within(await screen.findByRole("alertdialog")).getByText("2 questões em branco.")).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Entregar" }));

      expect(await screen.findByText(/Atividade entregue em sexta-feira, 2 de outubro/)).toBeTruthy();
      const post = (api.calls as { method: string; url: string }[]).filter((call) => call.method === "POST");
      expect(post).toHaveLength(1);
      const fetchMock = globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } };
      const body = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => url.endsWith("/submit") && init.method === "POST")![1].body));
      expect(body).toEqual({ answers: [{ questionId: open.id, answer: { kind: "TEXT", text: "na entrega" }, baseRevision: 0 }] });
      expect(screen.queryByRole("button", { name: "Entregar atividade" })).toBeNull();
      expect((screen.getByLabelText("Sua resposta") as HTMLTextAreaElement).disabled).toBe(true);
      expect(readPendingAnswers("aluno-1", activity.id)).toEqual([]);
    });

    it("botão desabilitado durante o envio: dois cliques, uma entrega", async () => {
      let resolve: (response: Response) => void = () => undefined;
      const { user, api } = setup({ [GET]: json(200, started()), [SUBMIT]: () => new Promise<Response>((done) => (resolve = done)) });
      await user.click(await screen.findByRole("button", { name: "Entregar atividade" }));
      await user.click(screen.getByRole("button", { name: "Entregar" }));
      const button = screen.getByRole("button", { name: "Entregar atividade" }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      await act(async () => resolve(json(200, submitted())));
      expect(await screen.findByText(/Atividade entregue em/)).toBeTruthy();
      expect(api.calls.filter((call) => call.method === "POST")).toHaveLength(1);
    });

    it("012/US4-2 queda depois do envio: repete a mesma chamada sozinho e mostra a mesma entrega", async () => {
      let calls = 0;
      const api = routedFetch({ [GET]: json(200, started()), [SUBMIT]: json(200, submitted()) });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string, init?: RequestInit) => {
          if (String(input).endsWith("/submit") && ++calls === 1) throw new TypeError("Failed to fetch");
          return api.fetch(input, init);
        }),
      );
      renderWithProviders(<ActivityAnswering activityId={activity.id} userId="aluno-1" />);
      const user = userEvent.setup();
      await user.click(await screen.findByRole("button", { name: "Entregar atividade" }));
      await user.click(screen.getByRole("button", { name: "Entregar" }));
      expect(await screen.findByText(/Atividade entregue em/, {}, { timeout: 3_000 })).toBeTruthy();
      expect(calls).toBe(2);
    });

    it("012/US4-5 recusa (prazo encerrado) mostra o motivo e mantém as respostas", async () => {
      const { user } = setup({ [GET]: json(200, started()), [SUBMIT]: apiError(409, "DEADLINE_PASSED", "x") });
      await user.type(await screen.findByLabelText("Sua resposta"), "fica");
      await user.click(screen.getByRole("button", { name: "Entregar atividade" }));
      await user.click(screen.getByRole("button", { name: "Entregar" }));
      expect(await screen.findByText(/O prazo desta atividade terminou/)).toBeTruthy();
      expect((screen.getByLabelText("Sua resposta") as HTMLTextAreaElement).value).toBe("fica");
      expect(screen.getByRole("button", { name: "Entregar atividade" })).toBeTruthy();
    });

    it("ANSWER_CHANGED_ELSEWHERE recarrega as respostas do servidor e pede revisão", async () => {
      writePendingAnswers("aluno-1", activity.id, []);
      let gets = 0;
      const { user } = setup({
        [GET]: () =>
          json(
            200,
            ++gets === 1
              ? started()
              : started({
                  attempt: {
                    number: 1,
                    startedAt: "2026-10-02T11:00:00.000Z",
                    lastSavedAt: "2026-10-02T12:01:00.000Z",
                    answers: [{ questionId: open.id, answer: { kind: "TEXT", text: "da outra aba" }, revision: 2 }],
                  },
                }),
          ),
        [SAVE]: saved(open.id),
        [SUBMIT]: apiError(409, "ANSWER_CHANGED_ELSEWHERE", "x"),
      });
      await user.type(await screen.findByLabelText("Sua resposta"), "desta aba");
      await user.click(screen.getByRole("button", { name: "Entregar atividade" }));
      await user.click(screen.getByRole("button", { name: "Entregar" }));
      expect(await screen.findByText(CHANGED_ELSEWHERE)).toBeTruthy();
      await vi.waitFor(() => expect((screen.getByLabelText("Sua resposta") as HTMLTextAreaElement).value).toBe("da outra aba"));
      expect(readPendingAnswers("aluno-1", activity.id)).toEqual([]);
      expect(screen.getByRole("button", { name: "Entregar atividade" })).toBeTruthy();
    });

    it("012/SC-009 entregue com atraso: confirmação com a marca e nenhuma ação de edição", async () => {
      const { container } = setup({
        [GET]: json(200, submitted({ late: true, submission: { submittedAt: "2026-10-02T12:30:00.000Z", late: true, acceptedByTeacher: false, blankCount: 0 } })),
      });
      expect(await screen.findByText(/Entrega com atraso\./)).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Entregar atividade" })).toBeNull();
      expect(screen.queryByText("Resposta salva")).toBeNull();
      await expectNoA11yViolations(container);
    });
  });

  describe("012/US6 resultado liberado", () => {
    it("012/US6-2 nota total, nota e feedback por questão e feedback geral; nunca gabarito", async () => {
      const { container } = setup({
        [GET]: json(
          200,
          submitted({
            status: "GRADED",
            result: {
              grade: "0.85",
              generalFeedback: "Bom trabalho.",
              questions: [
                { questionId: open.id, grade: "0.35", feedback: "Faltou citar a interface." },
                { questionId: multiple.id, grade: "0.30", feedback: null },
                { questionId: code.id, grade: "0.20", feedback: null },
              ],
            },
          }),
        ),
      });
      const result = await screen.findByRole("region", { name: "Resultado" });
      expect(within(result).getByText("0,85 de 1,00")).toBeTruthy();
      expect(within(result).getByText("Bom trabalho.")).toBeTruthy();
      const perQuestion = within(result).getByRole("list", { name: "Nota por questão" });
      expect(within(perQuestion).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
        "Questão 1: 0,35 de 0,40Feedback: Faltou citar a interface.",
        "Questão 2: 0,30 de 0,30",
        "Questão 3: 0,20 de 0,30",
      ]);
      expect(container.textContent).not.toMatch(/correta|Resposta esperada|Solução/);
      await expectNoA11yViolations(container);
    });

    it("012/US6-1 entregue e sem resultado: nenhuma nota na tela", async () => {
      setup({ [GET]: json(200, submitted()) });
      expect(await screen.findByText(/Atividade entregue em/)).toBeTruthy();
      expect(screen.queryByRole("region", { name: "Resultado" })).toBeNull();
    });
  });
});

describe("013/US2 responder e concluir um Exercício", () => {
  const exercise = exerciseActivity();
  const COMPLETE = `POST /api/me/activities/${exercise.id}/attempts/1/complete`;
  const practicing = (overrides = {}) =>
    exerciseActivity({
      status: "IN_PROGRESS",
      serverNow: "2030-12-31T23:55:00.000Z",
      attempt: { number: 1, startedAt: "2026-10-02T11:00:00.000Z", lastSavedAt: null, answers: [] },
      ...overrides,
    });
  const concluded = exerciseActivity({
    status: "COMPLETED",
    points: { possible: 105, earned: 30, awaitingCorrection: true },
    completedAttempts: [{ number: 1, completedAt: "2026-10-03T14:05:00.000Z" }],
    lastResult: exerciseAttempt(),
  });

  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.dispatchEvent(new Event("online"));
  });

  it("013/US2-1 013/FR-013 sem prazo, nota, contagem de tempo nem aviso de prazo; cada exercício vale os pontos do nível", async () => {
    const { container } = setup({ [GET]: json(200, practicing()) });
    expect(await screen.findByRole("heading", { level: 1, name: "Prática de herança" })).toBeTruthy();
    expect(screen.getByText("Vale até 105 pontos")).toBeTruthy();
    expect(screen.getByText("Pergunta e resposta · Vale 15 pontos")).toBeTruthy();
    expect(screen.queryByText(/Prazo|Nota total|Faltam|Falta 1 minuto|Entregar/)).toBeNull();
    expect(screen.getByRole("button", { name: "Concluir exercícios" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("013/US2-8 013/FR-007 \"Concluir exercícios\" confirma com os exercícios em branco e envia as respostas pendentes", async () => {
    const fetchSpy = setup({ [GET]: json(200, practicing()), [COMPLETE]: json(200, concluded) });
    const { user } = fetchSpy;
    await user.type(await screen.findByLabelText("Sua resposta"), "Esconder o estado.");
    await user.click(screen.getByRole("button", { name: "Concluir exercícios" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Concluir estes exercícios?" });
    expect(within(dialog).getByText(COMPLETE_CONFIRMATION)).toBeTruthy();
    expect(within(dialog).getByText("2 exercícios em branco valem 0 ponto nesta conclusão.")).toBeTruthy();
    expect(fetchSpy.api.calls.some((call) => `${call.method} ${call.url}` === COMPLETE)).toBe(false);

    await user.click(within(dialog).getByRole("button", { name: "Concluir" }));
    expect(await screen.findByRole("heading", { name: "Resultado da tentativa 1" })).toBeTruthy();
    const sent = (vi.mocked(fetch).mock.calls.find(([url, init]) => `${init?.method} ${url}` === COMPLETE)![1]?.body) as string;
    expect(JSON.parse(sent).answers).toEqual([{ questionId: open.id, answer: { kind: "TEXT", text: "Esconder o estado." }, baseRevision: 0 }]);
    // The offline buffer of the activity is cleared with the conclusion.
    expect(readPendingAnswers("aluno-1", exercise.id)).toEqual([]);
  });

  it("013/FR-007 conclusão recusada (atividade encerrada) mostra o motivo e mantém as respostas", async () => {
    const { user } = setup({ [GET]: json(200, practicing()), [COMPLETE]: apiError(409, "ACTIVITY_CLOSED", "x") });
    await user.click(await screen.findByRole("button", { name: "Concluir exercícios" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Concluir" }));
    expect(await screen.findByText("Suas respostas continuam salvas.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Concluir exercícios" })).toBeTruthy();
  });

  it("013/SC-008 ciclo praticar → concluir → ver gabarito → refazer só com o teclado", async () => {
    const retried = exerciseActivity({
      ...concluded,
      attempt: { number: 2, startedAt: "2026-10-03T15:00:00.000Z", lastSavedAt: null, answers: [] },
    });
    const { user } = setup({
      [GET]: json(200, practicing()),
      [COMPLETE]: json(200, concluded),
      [`POST /api/me/activities/${exercise.id}/attempts`]: json(200, retried),
    });
    await screen.findByRole("button", { name: "Concluir exercícios" });
    const concludeButton = screen.getByRole("button", { name: "Concluir exercícios" });
    await expectTabOrder(user, [concludeButton]);
    concludeButton.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("alertdialog");
    await user.keyboard("{Tab}{Enter}");
    const retry = await screen.findByRole("button", { name: "Refazer" });
    retry.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Tentativa 2. Refazer não vale pontos.")).toBeTruthy();
  });
});

describe("014/US1 a resposta de código colorida mantém tudo da 012", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.dispatchEvent(new Event("online"));
  });

  const SOURCE = "class Main {\n\tint x = 1;  \n  // ação 😀\n}";
  const answered = (source: string) =>
    started({
      attempt: {
        number: 1,
        startedAt: "2026-10-02T11:00:00.000Z",
        lastSavedAt: "2026-10-02T11:30:00.000Z",
        answers: [{ questionId: code.id, answer: { kind: "CODE", source }, revision: 2 }],
      },
    });
  const toCode = async (user: ReturnType<typeof userEvent.setup>) => {
    const navigator = await screen.findByRole("navigation", { name: "Questões" });
    await user.click(within(navigator).getAllByRole("button")[2]!);
    return codeMirrorContent();
  };
  const putSources = (api: ReturnType<typeof routedFetch>) =>
    api.calls
      .filter((call) => call.method === "PUT")
      .flatMap((call) => (JSON.parse(String(call.body)) as { answers: { answer: { source?: string } }[] }).answers)
      .map((item) => item.answer.source);

  it("014/US1-4 resposta salva, recarregada e do buffer offline volta idêntica", async () => {
    const { user, api, unmount } = setup({ [GET]: json(200, started()), [SAVE]: saved(code.id) });
    const content = await toCode(user);
    expect(syntaxSegments(content)).toEqual(expect.arrayContaining([["class", "text-syntax-keyword"]]));
    content.focus();
    await user.keyboard("{Control>}{End}{/Control}");
    await typeCode(user, "\n// fim");
    await user.keyboard("{Tab}");
    await typeCode(user, "ok  ");
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await vi.waitFor(() => expect(putSources(api)).toEqual(["class Main {}\n// fim  ok  "]));
    unmount();

    // Reloaded from the server: the same characters, tabs and trailing spaces.
    const reloaded = setup({ [GET]: json(200, answered(SOURCE)) });
    expect(codeMirrorText(await toCode(reloaded.user))).toBe(SOURCE);
    reloaded.unmount();

    // From the offline buffer of this browser.
    writePendingAnswers("aluno-1", activity.id, [{ questionId: code.id, answer: { kind: "CODE", source: SOURCE }, baseRevision: 0 }]);
    const buffered = setup({ [GET]: json(200, started()) });
    expect(codeMirrorText(await toCode(buffered.user))).toBe(SOURCE);
  });

  it("014/US1-5 linguagem sem gramática (highlight null) responde sem cores", async () => {
    const kotlin = { ...code, language: { name: "Kotlin", highlight: null } };
    const { user, api } = setup({ [GET]: json(200, started({ questions: [open, multiple, kotlin] })), [SAVE]: saved(code.id) });
    const content = await toCode(user);
    expect(screen.getByRole("textbox", { name: "Sua resposta (Kotlin)" })).toBe(content);
    content.focus();
    await user.keyboard("{Control>}{End}{/Control}");
    await typeCode(user, " fun main() {}");
    expect(syntaxSegments(content)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await vi.waitFor(() => expect(putSources(api)).toEqual(["class Main {} fun main() {}"]));
  });

  it("014/US1-6 colar <script> ou HTML aparece como texto e é salvo exato", async () => {
    const { user, api } = setup({ [GET]: json(200, started()), [SAVE]: saved(code.id) });
    const content = await toCode(user);
    content.focus();
    await user.keyboard("{Control>}a{/Control}");
    const pasted = '<script>alert(1)</script><img src=x onerror="alert(2)">';
    await user.paste(pasted);
    expect(codeMirrorText(content)).toBe(pasted);
    expect(document.querySelector("script, img")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    await vi.waitFor(() => expect(putSources(api)).toEqual([pasted]));
  });
});
