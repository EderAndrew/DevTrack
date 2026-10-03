import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { readPendingAnswers, writePendingAnswers } from "../store/pending-answers";
import { ActivityAnswering, CHANGED_ELSEWHERE, CONFLICT_ALERT, DEADLINE_WARNINGS, OFFLINE_ALERT, SUBMIT_CONFIRMATION } from "./activity-answering";
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
