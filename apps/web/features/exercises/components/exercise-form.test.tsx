import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { codeEditorByLabel, codeMirrorText, syntaxSegments, typeCode } from "../../../test/code-editor";
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
  const solution = await codeEditorByLabel(/^Solução esperada/, card(n));
  solution.focus();
  await typeCode(user, "class A {}");
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
        { type: "CODE", statement: "Código 3", ...common, instructions: "Implemente.", expectedSolution: "class A {}", languageId: JAVA.id, testCases: [] },
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

describe("014/US3 ExerciseForm — o professor escreve código colorido", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    fetchMock.mockImplementation(
      exerciseApiMock((url, body) => {
        writes.push({ url, body });
        return json(201, exerciseView());
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const exercise = () => within(screen.getByRole("group", { name: "Exercício" }));

  /** A single Código exercise in `language`; the two code editors once CodeMirror has loaded. */
  async function codeExercise(user: UserEvent, language: string) {
    await user.selectOptions(exercise().getByLabelText(/^Tipo/), "Exercício de código");
    await exercise().findByRole("option", { name: language });
    await user.selectOptions(exercise().getByLabelText(/^Linguagem/), language);
    return { starter: await codeEditorByLabel(/^Código inicial/), solution: await codeEditorByLabel(/^Solução esperada/) };
  }

  it("014/US3-1 código inicial e solução esperada usam o editor com a gramática da linguagem escolhida", async () => {
    const { container } = renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    const { starter, solution } = await codeExercise(user, "Python");

    starter.focus();
    await typeCode(user, "def main():");
    solution.focus();
    await typeCode(user, "def main(): # pronto");
    await waitFor(() => expect(syntaxSegments(starter)).toEqual(expect.arrayContaining([["def", "text-syntax-keyword"]])));
    expect(syntaxSegments(solution)).toEqual(
      expect.arrayContaining([
        ["def", "text-syntax-keyword"],
        ["# pronto", "text-syntax-comment"],
      ]),
    );
    // Line numbers and the student's keyboard rules: Tab indents, Esc then Tab leaves.
    expect(solution.closest(".cm-editor")!.querySelector(".cm-lineNumbers")).toBeTruthy();
    expect(exercise().getAllByText("Tab indenta o código; Esc e depois Tab sai do editor.")).toHaveLength(2);
    await user.keyboard("{Tab}");
    expect(codeMirrorText(solution)).toBe("def main(): # pronto  ");
    expect(document.activeElement).toBe(solution);
    await user.keyboard("{Escape}");
    await user.tab();
    expect(document.activeElement).toBe(exercise().getByLabelText(/^Linguagem/));
    await expectNoA11yViolations(container);
  });

  it("014/US3-2 trocar a linguagem muda o realce e mantém o texto", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    const { solution } = await codeExercise(user, "Python");
    solution.focus();
    await typeCode(user, "def f(): // nota");
    await waitFor(() => expect(syntaxSegments(solution)).toEqual(expect.arrayContaining([["def", "text-syntax-keyword"]])));
    expect(syntaxSegments(solution)).not.toEqual(expect.arrayContaining([["// nota", "text-syntax-comment"]]));

    await user.selectOptions(exercise().getByLabelText(/^Linguagem/), "Java");
    await waitFor(() => expect(syntaxSegments(solution)).toEqual(expect.arrayContaining([["// nota", "text-syntax-comment"]])));
    expect(syntaxSegments(solution)).not.toEqual(expect.arrayContaining([["def", "text-syntax-keyword"]]));
    expect(codeMirrorText(solution)).toBe("def f(): // nota");
    expect(await codeEditorByLabel(/^Solução esperada/)).toBe(solution);
  });

  it("014/US3-3 solução vazia: o erro fica ligado ao editor e o link do resumo leva o foco a ele", async () => {
    const { container } = renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    const { solution } = await codeExercise(user, "Java");
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));

    const summary = await screen.findByRole("group", { name: "Não foi possível salvar o exercício" });
    await waitFor(() => expectFieldErrorLinked(solution));
    expect(document.getElementById(solution.getAttribute("aria-describedby")!.split(" ").find((id) => id.endsWith("-erro"))!)!.textContent).toBe(
      "Informe a solução esperada.",
    );
    await user.click(within(summary).getByRole("link", { name: "Informe a solução esperada." }));
    expect(document.activeElement).toBe(solution);
    expect(writes).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it("014/US3-4 o corpo enviado traz o texto exato do código inicial e da solução", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    await user.type(exercise().getByLabelText(/^Enunciado/), "Some");
    await user.selectOptions(exercise().getByLabelText(/^Dificuldade/), "Básico");
    await user.selectOptions(exercise().getByLabelText(/^Objetivo cognitivo/), "Compreender");
    await user.type(exercise().getByLabelText(/^Explicação/), "Porque sim.");
    const { starter, solution } = await codeExercise(user, "Python");
    await user.type(exercise().getByLabelText(/^Instruções/), "Some dois números.");

    starter.focus();
    await typeCode(user, "def soma(a, b):");
    // Enter indents the body by the Python grammar (FR-007, amended 2026-10-27).
    await vi.waitFor(() => expect(syntaxSegments(starter)).toEqual(expect.arrayContaining([["def", "text-syntax-keyword"]])));
    await typeCode(user, "\n");
    await typeCode(user, "pass  ");
    solution.focus();
    await typeCode(user, "def soma(a, b):");
    // Enter indents the body by the Python grammar (FR-007, amended 2026-10-27).
    await vi.waitFor(() => expect(syntaxSegments(solution)).toEqual(expect.arrayContaining([["def", "text-syntax-keyword"]])));
    await typeCode(user, "\n");
    await typeCode(user, "return a + b  # ação {ok}");
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));

    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({
      url: "/api/exercises",
      body: expect.objectContaining({
        type: "CODE",
        starterCode: "def soma(a, b):\n  pass  ",
        expectedSolution: "def soma(a, b):\n  return a + b  # ação {ok}",
        languageId: PYTHON.id,
        status: "APPROVED",
      }),
    });
  });
});

describe("019/US2 ExerciseForm — casos de teste num conjunto", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    fetchMock.mockImplementation(
      exerciseApiMock((url, body) => {
        writes.push({ url, body });
        return json(201, { items: (body as { exercises: unknown[] }).exercises.map(() => exerciseView()) });
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("019/US2-1 019/US2-2 só o cartão de código tem casos; o erro de um caso nomeia o exercício no resumo", async () => {
    renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    await fillOpenAnswer(user, 1);
    await fillMultipleChoice(user, 2);
    await fillCode(user, 3);
    expect(within(card(1)).queryByRole("group", { name: "Casos de teste" })).toBeNull();
    expect(within(card(2)).queryByRole("group", { name: "Casos de teste" })).toBeNull();
    const cases = within(card(3)).getByRole("group", { name: "Casos de teste" });
    await user.click(within(cases).getByRole("button", { name: "Adicionar caso" }));
    await user.type(within(cases).getByLabelText(/^Entrada do caso 1/), "7");

    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));
    const field = within(cases).getByLabelText(/^Saída esperada do caso 1/);
    await waitFor(() => expectFieldErrorLinked(field));
    expect(screen.getByRole("link", { name: "Exercício 3: Informe a saída esperada do caso." }).getAttribute("href")).toBe(`#${field.id}`);
    expect(writes).toHaveLength(0);

    await user.type(field, "14");
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    const exercises = (writes[0]!.body as { exercises: Record<string, unknown>[] }).exercises;
    expect(exercises.map((exercise) => exercise.testCases)).toEqual([undefined, undefined, [{ input: "7", expectedOutput: "14", visibility: "PUBLIC" }]]);
  });
});

describe("019/US4 ExerciseForm — a linguagem diz se os alunos poderão executar", () => {
  const CPP = { id: "00000000-0000-4000-a000-000000000003", key: "cpp", name: "C++", highlight: "cpp", execution: null };

  beforeEach(() => {
    const base = exerciseApiMock(() => json(201, exerciseView()));
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input, init) => (String(input) === "/api/programming-languages" ? json(200, [JAVA, PYTHON, CPP]) : base(input, init))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("019/US4-2 019/FR-020 a frase vem do catálogo, muda com a linguagem e fica ligada ao campo", async () => {
    renderWithProviders(<ExerciseForm mode="set" />);
    const user = userEvent.setup();
    const scope = within(card(1));
    await user.selectOptions(scope.getByLabelText(/^Tipo/), "Exercício de código");
    await vi.waitFor(() => expect(scope.getByRole("option", { name: "C++" })).toBeTruthy());
    const language = scope.getByLabelText(/^Linguagem/);
    expect(scope.queryByText("Os alunos poderão executar o código.")).toBeNull();
    expect(scope.queryByText("Sem execução nesta linguagem.")).toBeNull();

    await user.selectOptions(language, PYTHON.name);
    const runs = scope.getByText("Os alunos poderão executar o código.");
    expect(language.getAttribute("aria-describedby")?.split(" ")).toContain(runs.id);

    await user.selectOptions(language, "C++");
    const none = scope.getByText("Sem execução nesta linguagem.");
    expect(language.getAttribute("aria-describedby")?.split(" ")).toContain(none.id);
    expect(scope.queryByText("Os alunos poderão executar o código.")).toBeNull();
  });
});

describe("ExerciseForm — exemplos nos campos de um exercício de código", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    fetchMock.mockImplementation(
      exerciseApiMock((url, body) => {
        writes.push({ url, body });
        return json(201, exerciseView());
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const exercise = () => within(screen.getByRole("group", { name: "Exercício" }));
  /** The example CodeMirror shows in an empty editor. */
  const exampleOf = (editor: HTMLElement) => editor.closest(".cm-editor")!.querySelector(".cm-placeholder")?.textContent ?? "";

  it("cada campo vazio de um exercício de código mostra um exemplo, e os outros tipos não", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    expect(exercise().getByLabelText(/^Enunciado/).getAttribute("placeholder")).toBeNull();

    await user.selectOptions(exercise().getByLabelText(/^Tipo/), "Exercício de código");
    expect(exercise().getByLabelText(/^Enunciado/).getAttribute("placeholder")).toMatch(/^Ex\.: Escreva um programa/);
    expect(exercise().getByLabelText(/^Instruções/).getAttribute("placeholder")).toMatch(/^Ex\.: Leia os dois números/);
    expect(exercise().getByLabelText(/^Explicação/).getAttribute("placeholder")).toMatch(/^Ex\.: /);

    await user.click(exercise().getByRole("button", { name: /Adicionar caso/ }));
    expect(exercise().getByLabelText(/^Entrada do caso 1/).getAttribute("placeholder")).toBe("Ex.: 2 3");
    expect(exercise().getByLabelText(/^Saída esperada do caso 1/).getAttribute("placeholder")).toBe("Ex.: 5");

    await user.selectOptions(exercise().getByLabelText(/^Tipo/), "Pergunta e resposta");
    expect(exercise().getByLabelText(/^Enunciado/).getAttribute("placeholder")).toBeNull();
    expect(exercise().getByLabelText(/^Resposta esperada/).getAttribute("placeholder")).toBeNull();
  });

  it("o exemplo de código segue a linguagem escolhida e nunca é enviado", async () => {
    renderWithProviders(<ExerciseForm mode="single" />);
    const user = userEvent.setup();
    await user.selectOptions(exercise().getByLabelText(/^Tipo/), "Exercício de código");
    const starter = await codeEditorByLabel(/^Código inicial/);
    const solution = await codeEditorByLabel(/^Solução esperada/);
    expect(exampleOf(solution)).toMatch(/Escolha a linguagem/);

    await exercise().findByRole("option", { name: "Python" });
    await user.selectOptions(exercise().getByLabelText(/^Linguagem/), "Python");
    await waitFor(() => expect(exampleOf(solution)).toContain("print(a + b)"));
    expect(exampleOf(starter)).toContain("# Escreva sua solução aqui");

    await user.selectOptions(exercise().getByLabelText(/^Linguagem/), "Java");
    await waitFor(() => expect(exampleOf(solution)).toContain("public class Main"));

    // Only what the teacher typed is saved: the examples stay out of the body.
    await user.type(exercise().getByLabelText(/^Enunciado/), "Some dois números.");
    await user.selectOptions(exercise().getByLabelText(/^Dificuldade/), "Básico");
    await user.selectOptions(exercise().getByLabelText(/^Objetivo cognitivo/), "Compreender");
    await user.type(exercise().getByLabelText(/^Instruções/), "Leia e some.");
    solution.focus();
    await typeCode(user, "class Main {}");
    await user.type(exercise().getByLabelText(/^Explicação/), "Soma simples.");
    await user.click(screen.getByRole("button", { name: "Salvar no banco" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(JSON.stringify(writes[0]!.body)).not.toContain("Ex.:");
    expect(JSON.stringify(writes[0]!.body)).not.toContain("Escreva sua solução aqui");
  });
});
