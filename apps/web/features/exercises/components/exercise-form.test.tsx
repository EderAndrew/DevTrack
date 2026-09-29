import { screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ExerciseForm } from "./exercise-form";
import { apiError, exerciseApiMock, exerciseView, JAVA, json, POO, POO_REVISION, PYTHON } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const card = (n: number) => screen.getByRole("group", { name: `Exercício ${n}` });

/** Fills the common fields of card `n` and makes it the given type. */
async function fillCommon(user: UserEvent, n: number, type: string, statement: string) {
  const scope = within(card(n));
  await user.selectOptions(scope.getByLabelText(/^Tipo/), type);
  await user.type(scope.getByLabelText(/^Enunciado/), statement);
  await user.selectOptions(scope.getByLabelText(/^Dificuldade/), "Básico");
  await user.selectOptions(scope.getByLabelText(/^Objetivo cognitivo/), "Compreender");
  await user.type(scope.getByLabelText(/^Explicação/), "Porque sim.");
}

async function fillOpenAnswer(user: UserEvent, n: number) {
  await fillCommon(user, n, "Pergunta e resposta", `Pergunta ${n}`);
  await user.type(within(card(n)).getByLabelText(/^Resposta esperada/), "Resposta");
}

async function fillMultipleChoice(user: UserEvent, n: number, correct: number | null = 1) {
  await fillCommon(user, n, "Múltipla escolha", `Escolha ${n}`);
  const scope = within(card(n));
  for (const [index, text] of ["extends", "implements", "inherits"].entries()) {
    await user.type(scope.getByLabelText(new RegExp(`^Alternativa ${index + 1}`)), text);
  }
  if (correct !== null) await user.click(scope.getByRole("radio", { name: `Correta (alternativa ${correct})` }));
}

async function fillCode(user: UserEvent, n: number, language: string | null = "Java") {
  await fillCommon(user, n, "Exercício de código", `Código ${n}`);
  const scope = within(card(n));
  await user.type(scope.getByLabelText(/^Instruções/), "Implemente.");
  await user.type(scope.getByLabelText(/^Solução esperada/), "class A {{}");
  if (language) await user.selectOptions(scope.getByLabelText(/^Linguagem/), language);
}

describe("010/US1 ExerciseForm — criar exercícios manualmente", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    fetchMock.mockImplementation(
      exerciseApiMock((url, body) => {
        writes.push({ url, body });
        const items = (body as { exercises?: unknown[] }).exercises?.map(() => exerciseView()) ?? [];
        return url === "/api/exercises/sets" ? json(201, { items }) : json(201, exerciseView());
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("010/FR-016 começa com 3 cartões, acrescenta até 10 e não remove abaixo de 3", async () => {
    const { container } = renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Exercício 1", "Exercício 2", "Exercício 3"]);
    expect(screen.queryByRole("button", { name: /^Remover Exercício/ })).toBeNull();
    await expectNoA11yViolations(container);

    const add = screen.getByRole("button", { name: "Adicionar exercício" });
    for (let i = 0; i < 7; i += 1) await user.click(add);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(10);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("10 de 10")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Remover Exercício 10" }));
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(9);
    expect(document.activeElement).toBe(add);
    expect((add as HTMLButtonElement).disabled).toBe(false);
  });

  it("010/US1-1 salva um conjunto com um exercício de cada tipo no banco", async () => {
    renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    await fillOpenAnswer(user, 1);
    await fillMultipleChoice(user, 2, 1);
    await user.click(within(card(2)).getByLabelText("Pegadinha"));
    await fillCode(user, 3);

    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/exercicios?criados=3"));
    expect(writes).toHaveLength(1);
    expect(writes[0]!.url).toBe("/api/exercises/sets");
    const common = { explanation: "Porque sim.", difficulty: "BASIC", cognitiveObjective: "UNDERSTAND" };
    expect(writes[0]!.body).toEqual({
      status: "APPROVED",
      exercises: [
        { type: "OPEN_ANSWER", statement: "Pergunta 1", ...common, expectedAnswer: "Resposta" },
        {
          type: "MULTIPLE_CHOICE",
          statement: "Escolha 2",
          ...common,
          alternatives: [
            { text: "extends", isCorrect: true },
            { text: "implements", isCorrect: false },
            { text: "inherits", isCorrect: false },
          ],
          isTrickQuestion: true,
        },
        { type: "CODE", statement: "Código 3", ...common, instructions: "Implemente.", expectedSolution: "class A {}", languageId: JAVA.id },
      ],
    });
  });

  it("010/FR-011 \"Salvar como rascunho\" envia DRAFT", async () => {
    renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    for (const n of [1, 2, 3]) await fillOpenAnswer(user, n);
    await user.click(screen.getByRole("button", { name: "Salvar como rascunho" }));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toMatchObject({ status: "DRAFT" });
  });

  it("campos vazios: erro por campo, ligado ao campo e no resumo com o número do exercício, sem chamar a API", async () => {
    const { container } = renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível salvar os exercícios" });
    expect(summary.textContent).toContain("Exercício 1: Informe o enunciado.");
    expect(summary.textContent).toContain("Exercício 3: Escolha a dificuldade.");
    for (const label of [/^Enunciado/, /^Dificuldade/, /^Objetivo cognitivo/, /^Resposta esperada/, /^Explicação/]) {
      expectFieldErrorLinked(within(card(2)).getByLabelText(label));
    }
    expect(writes).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it("010/US1-3 múltipla escolha sem a correta ou com textos repetidos é recusada no formulário", async () => {
    renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    await fillMultipleChoice(user, 1, null);
    await fillOpenAnswer(user, 2);
    await fillOpenAnswer(user, 3);
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível salvar os exercícios" });
    expect(summary.textContent).toContain("Exercício 1: Marque a alternativa correta.");
    expectFieldErrorLinked(within(card(1)).getByRole("radio", { name: "Correta (alternativa 1)" }));

    const third = within(card(1)).getByLabelText(/^Alternativa 3/);
    await user.clear(third);
    await user.type(third, "EXTENDS");
    await user.click(within(card(1)).getByRole("radio", { name: "Correta (alternativa 1)" }));
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));
    await vi.waitFor(() => expect(screen.getByRole("group", { name: "Não foi possível salvar os exercícios" }).textContent).toContain(
      "Exercício 1: As alternativas não podem repetir o mesmo texto.",
    ));
    expect(writes).toHaveLength(0);
  });

  it("010/FR-004 alternativas: de 3 a 5, e a marca de correta acompanha a alternativa removida", async () => {
    renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    await user.selectOptions(within(card(1)).getByLabelText(/^Tipo/), "Múltipla escolha");
    const scope = within(card(1));
    const add = scope.getByRole("button", { name: "Adicionar alternativa" });
    expect((scope.getByRole("button", { name: "Remover alternativa 1" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(add);
    await user.click(add);
    expect(scope.getAllByLabelText(/^Alternativa \d/)).toHaveLength(5);
    expect((add as HTMLButtonElement).disabled).toBe(true);

    await user.click(scope.getByRole("radio", { name: "Correta (alternativa 5)" }));
    await user.click(scope.getByRole("button", { name: "Remover alternativa 2" }));
    expect((scope.getByRole("radio", { name: "Correta (alternativa 4)" }) as HTMLInputElement).checked).toBe(true);
    await user.click(scope.getByRole("button", { name: "Remover alternativa 4" }));
    expect(scope.getAllByRole("radio").some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
  });

  it("010/FR-040 código ligado a um tópico: a linguagem da ementa vem sugerida e o professor pode trocá-la", async () => {
    renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    await fillCode(user, 1, null);
    const scope = within(card(1));
    await user.selectOptions(await scope.findByRole("combobox", { name: /^Disciplina/ }), POO.name);
    await vi.waitFor(() => expect(scope.getByRole("option", { name: "Versão 1" })).toBeTruthy());
    await user.selectOptions(scope.getByLabelText(/^Ementa/), "Versão 1");
    await vi.waitFor(() => expect(scope.getByRole("option", { name: "Herança" })).toBeTruthy());
    await user.selectOptions(scope.getByLabelText(/^Tópico/), "Herança");

    const language = scope.getByLabelText(/^Linguagem/) as HTMLSelectElement;
    expect(language.value).toBe(JAVA.id);
    await user.selectOptions(language, PYTHON.name);

    await fillOpenAnswer(user, 2);
    await fillOpenAnswer(user, 3);
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect((writes[0]!.body as { exercises: object[] }).exercises[0]).toMatchObject({
      syllabusItemId: POO_REVISION.groups[0]!.items[0]!.id,
      languageId: PYTHON.id,
    });
  });

  it("erro da API aparece no resumo e nada muda de página", async () => {
    fetchMock.mockImplementation(exerciseApiMock(() => apiError(422, "REVISION_NOT_CONFIRMED", "x")));
    renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    for (const n of [1, 2, 3]) await fillOpenAnswer(user, n);
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível salvar os exercícios" });
    expect(summary.textContent).toContain("Confirme o conteúdo da ementa antes de usá-lo.");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("010/US5-6 exercício avulso: um cartão, sem acrescentar, enviado a POST /exercises", async () => {
    const { container } = renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Exercício"]);
    expect(screen.queryByRole("button", { name: "Adicionar exercício" })).toBeNull();
    await expectNoA11yViolations(container);

    const scope = within(screen.getByRole("group", { name: "Exercício" }));
    await user.type(scope.getByLabelText(/^Enunciado/), "Avulso");
    await user.selectOptions(scope.getByLabelText(/^Dificuldade/), "Avançado");
    await user.selectOptions(scope.getByLabelText(/^Objetivo cognitivo/), "Criar");
    await user.type(scope.getByLabelText(/^Resposta esperada/), "Sim");
    await user.type(scope.getByLabelText(/^Explicação/), "Porque sim.");
    await user.click(screen.getByRole("button", { name: "Salvar como rascunho" }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/exercicios?criados=1"));
    expect(writes).toEqual([
      {
        url: "/api/exercises",
        body: {
          type: "OPEN_ANSWER",
          statement: "Avulso",
          explanation: "Porque sim.",
          difficulty: "ADVANCED",
          cognitiveObjective: "CREATE",
          expectedAnswer: "Sim",
          status: "DRAFT",
        },
      },
    ]);
  });

  it("SC-012 a ordem de Tab segue o cartão e termina nos botões de salvar", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    const scope = within(screen.getByRole("group", { name: "Exercício" }));
    await expectTabOrder(user, [
      scope.getByLabelText(/^Tipo/),
      scope.getByLabelText(/^Enunciado/),
      scope.getByLabelText(/^Dificuldade/),
      scope.getByLabelText(/^Objetivo cognitivo/),
      scope.getByLabelText(/^Disciplina/),
      scope.getByLabelText(/^Resposta esperada/),
      scope.getByLabelText(/^Explicação/),
      screen.getByRole("button", { name: "Salvar no banco" }),
      screen.getByRole("button", { name: "Salvar como rascunho" }),
    ]);
  });
});
