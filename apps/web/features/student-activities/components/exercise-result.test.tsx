import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ActivityAnswering } from "./activity-answering";
import { exerciseActivity, exerciseAttempt, json, routedFetch } from "./test-fixtures";

// 013/US2 — the result of a concluded Exercício attempt: results by text and icon, the answer key,
// the explanation and the teacher's comment, the points of the first conclusion, "Refazer" and the
// earlier conclusions (contracts/web-ui.md).

const concluded = (overrides = {}) =>
  exerciseActivity({
    status: "COMPLETED",
    points: { possible: 105, earned: 30, awaitingCorrection: true },
    completedAttempts: [{ number: 1, completedAt: "2026-10-03T14:05:00.000Z" }],
    lastResult: exerciseAttempt(),
    ...overrides,
  });
const ID = exerciseActivity().id;
const GET = `GET /api/me/activities/${ID}`;
const RETRY = `POST /api/me/activities/${ID}/attempts`;

function setup(routes: Parameters<typeof routedFetch>[0]) {
  const api = routedFetch(routes);
  const fetch = vi.fn(api.fetch);
  vi.stubGlobal("fetch", fetch);
  const view = renderWithProviders(<ActivityAnswering activityId={ID} userId="aluno-1" />);
  return { ...view, api, fetch, user: userEvent.setup() };
}
const exercise = (name: string) => screen.getByRole("article", { name });

describe("013/US2 resultado da conclusão dos exercícios", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("013/US2-2 013/US2-4 013/FR-012 resultado por exercício com texto e ícone, gabarito, explicação e comentário; pontos ganhos", async () => {
    const { container } = setup({ [GET]: json(200, concluded()) });
    expect(await screen.findByRole("heading", { name: "Resultado da tentativa 1" })).toBeTruthy();
    expect(screen.getByText("Você ganhou 30 pontos.")).toBeTruthy();
    expect(screen.getByText(/Pontos aguardando correção: o professor ainda vai marcar/)).toBeTruthy();

    const open = exercise("Exercício 1");
    expect(within(open).getByText("Aguardando correção")).toBeTruthy();
    expect(within(open).getByText("Esconder o estado.")).toBeTruthy();
    expect(within(open).getByText("Proteger o estado atrás de métodos.")).toBeTruthy();
    expect(within(open).getByText("Encapsular é esconder detalhes.")).toBeTruthy();

    const choice = exercise("Exercício 2");
    expect(within(choice).getByText("Certo")).toBeTruthy();
    expect(within(choice).getByText("30 pontos")).toBeTruthy();
    expect(within(choice).getByText("Alternativa correta: Uma instância de uma classe.")).toBeTruthy();
    expect(within(choice).getByText("Muito bem.")).toBeTruthy();
    expect(within(choice).getByText("Comentário do professor")).toBeTruthy();

    const code = exercise("Exercício 3");
    expect(within(code).getByText("Errado")).toBeTruthy();
    expect(within(code).getByText("Em branco")).toBeTruthy();
    expect((within(code).getByRole("textbox", { name: "Solução de referência" }) as HTMLTextAreaElement).value).toBe("class Soma {}");

    // States never by color alone: each badge has its text and an icon.
    for (const label of ["Certo", "Errado", "Aguardando correção"]) {
      expect(screen.getByText(label).querySelector("svg"), label).toBeTruthy();
    }
    // No grade, deadline or "liberar" anywhere (013/FR-013).
    expect(screen.queryByText(/Nota|Prazo|liberad/i)).toBeNull();
    expect(screen.getByText("Vale até 105 pontos")).toBeTruthy();
    expect(screen.getByText("30 pontos · Pontos aguardando correção")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("013/US2-5 013/FR-005 \"Refazer\" abre a tentativa 2 em branco e avisa que refazer não vale pontos", async () => {
    const retried = concluded({
      status: "COMPLETED",
      attempt: { number: 2, startedAt: "2026-10-03T15:00:00.000Z", lastSavedAt: null, answers: [] },
    });
    const { user, fetch } = setup({ [GET]: json(200, concluded()), [RETRY]: json(200, retried) });
    await user.click(await screen.findByRole("button", { name: "Refazer" }));
    expect(await screen.findByText("Tentativa 2. Refazer não vale pontos.")).toBeTruthy();
    const call = fetch.mock.calls.find(([url, init]) => `${init?.method} ${url}` === RETRY)!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ afterNumber: 1 });
    expect(screen.getByRole("button", { name: "Concluir exercícios" })).toBeTruthy();
  });

  it("013/US2-5 013/US2-9 conclusão de prática: \"Compare com o gabarito\", já pontuado e os pontos da primeira", async () => {
    const practice = exerciseAttempt({
      number: 2,
      first: false,
      pointsEarned: 0,
      questions: exerciseAttempt().questions.map((item, index) =>
        index === 0 ? { ...item, result: "UNSCORED" as const } : { ...item, points: 0, alreadyScored: index === 1 },
      ),
    });
    setup({
      [GET]: json(200, concluded({ lastResult: practice, completedAttempts: [{ number: 2, completedAt: "2026-10-03T16:00:00.000Z" }, { number: 1, completedAt: "2026-10-03T14:05:00.000Z" }] })),
    });
    expect(await screen.findByText("Refazer não vale pontos. Seus pontos nesta atividade: 30 pontos.")).toBeTruthy();
    expect(within(exercise("Exercício 1")).getByText("Compare com o gabarito")).toBeTruthy();
    expect(within(exercise("Exercício 2")).queryByText("Já pontuado em outra atividade")).toBeTruthy();
    expect(screen.queryByText("Você ganhou", { exact: false })).toBeNull();
  });

  it("013/FR-012 as conclusões anteriores podem ser lidas de novo", async () => {
    const second = exerciseAttempt({ number: 2, first: false, pointsEarned: 0 });
    const { user } = setup({
      [GET]: json(200, concluded({ lastResult: second, completedAttempts: [{ number: 2, completedAt: "2026-10-03T16:00:00.000Z" }, { number: 1, completedAt: "2026-10-03T14:05:00.000Z" }] })),
      [`GET /api/me/activities/${ID}/attempts/1`]: json(200, exerciseAttempt()),
    });
    expect(await screen.findByRole("heading", { name: "Resultado da tentativa 2" })).toBeTruthy();
    const history = screen.getByRole("navigation", { name: "Tentativas concluídas" });
    await user.click(within(history).getByRole("button", { name: /^Tentativa 1 — / }));
    expect(await screen.findByRole("heading", { name: "Resultado da tentativa 1" })).toBeTruthy();
    expect(screen.getByText("Você ganhou 30 pontos.")).toBeTruthy();
    expect(within(history).getByRole("button", { name: /^Tentativa 1 — / }).getAttribute("aria-pressed")).toBe("true");
  });

  it("013/SC-008 resultado e \"Refazer\" pelo teclado, sem violações de acessibilidade", async () => {
    const { user, container } = setup({
      [GET]: json(200, concluded({ completedAttempts: [{ number: 1, completedAt: "2026-10-03T14:05:00.000Z" }] })),
    });
    const retry = await screen.findByRole("button", { name: "Refazer" });
    await expectNoA11yViolations(container);
    // The read-only editor of the answer key doesn't hold Tab: the focus goes on to "Refazer".
    const solution = screen.getByRole("textbox", { name: "Solução de referência" });
    await expectTabOrder(user, [solution, retry]);
  });
});
