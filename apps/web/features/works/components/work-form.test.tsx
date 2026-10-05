import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { codeEditorByLabel, codeMirrorText, syntaxSegments, typeCode } from "../../../test/code-editor";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import {
  apiError,
  itemId,
  JAVA,
  json,
  POO,
  PYTHON,
  workApiMock,
  workView,
} from "./test-fixtures";
import { WorkForm } from "./work-form";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const question = (n: number) =>
  screen.getByRole("group", { name: `Questão ${n}` });
const summaryTitle = "Não foi possível salvar o trabalho";

async function fillHeader(user: UserEvent, totalGrade = "10") {
  await screen.findByRole("option", { name: POO.name });
  await user.selectOptions(
    screen.getByRole("combobox", { name: /^Disciplina/ }),
    POO.name,
  );
  await user.type(screen.getByLabelText(/^Título/), "Trabalho de herança");
  await user.type(screen.getByLabelText(/^Nota total/), totalGrade);
}

async function fillOpenAnswer(user: UserEvent, n: number) {
  const scope = within(question(n));
  await user.selectOptions(
    scope.getByLabelText(/^Tipo/),
    "Pergunta e resposta",
  );
  await user.type(scope.getByLabelText(/^Enunciado/), `Pergunta ${n}`);
  await user.type(scope.getByLabelText(/^Resposta esperada/), "Resposta");
}

async function fillMultipleChoice(
  user: UserEvent,
  n: number,
  correct: number | null = 1,
) {
  const scope = within(question(n));
  await user.selectOptions(scope.getByLabelText(/^Tipo/), "Múltipla escolha");
  await user.type(scope.getByLabelText(/^Enunciado/), `Escolha ${n}`);
  for (const [index, text] of ["extends", "implements", "inherits"].entries()) {
    await user.type(
      scope.getByLabelText(new RegExp(`^Alternativa ${index + 1}`)),
      text,
    );
  }
  if (correct !== null)
    await user.click(
      scope.getByRole("radio", { name: `Correta (alternativa ${correct})` }),
    );
}

async function fillCode(
  user: UserEvent,
  n: number,
  language: string | null = "Java",
) {
  const scope = within(question(n));
  await user.selectOptions(scope.getByLabelText(/^Tipo/), "Código");
  await user.type(scope.getByLabelText(/^Enunciado/), `Código ${n}`);
  const solution = await codeEditorByLabel(/^Solução esperada/, question(n));
  solution.focus();
  await typeCode(user, "class A {}");
  if (language) {
    await scope.findByRole("option", { name: language });
    await user.selectOptions(
      scope.getByRole("combobox", { name: /^Linguagem/ }),
      language,
    );
  }
}

const addQuestion = (user: UserEvent) =>
  user.click(screen.getByRole("button", { name: "Adicionar questão" }));

describe("011/US1 WorkForm — criar um trabalho manualmente", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    fetchMock.mockImplementation(
      workApiMock((url, body) => {
        writes.push({ url, body });
        return json(201, workView());
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("011/US1-2 começa com 1 questão, acrescenta até 10 e não remove abaixo de 1", async () => {
    const { container } = renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Questão 1"]);
    expect(
      screen.queryByRole("button", { name: /^Remover Questão/ }),
    ).toBeNull();
    await expectNoA11yViolations(container);

    const add = screen.getByRole("button", { name: "Adicionar questão" });
    for (let i = 0; i < 9; i += 1) await user.click(add);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(10);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("10 de 10")).toBeTruthy();

    await user.click(
      screen.getByRole("button", { name: "Remover Questão 10" }),
    );
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(9);
    expect(document.activeElement).toBe(add);
    expect((add as HTMLButtonElement).disabled).toBe(false);
  });

  it("011/US1-1 salva e aprova um trabalho com uma questão de cada tipo, mostrando quanto vale cada uma", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await fillHeader(user, "7,5");
    await addQuestion(user);
    await addQuestion(user);
    await fillOpenAnswer(user, 1);
    await fillMultipleChoice(user, 2, 1);
    await user.click(within(question(2)).getByLabelText("Pegadinha"));
    await fillCode(user, 3);
    await user.click(
      within(question(3)).getByRole("button", {
        name: "Adicionar caso de teste",
      }),
    );
    await user.type(
      within(question(3)).getByLabelText(/^Entrada do caso 1/),
      "1",
    );
    await user.type(
      within(question(3)).getByLabelText(/^Saída esperada do caso 1/),
      "2",
    );
    await user.selectOptions(
      within(question(3)).getByLabelText(/^Visibilidade do caso 1/),
      "Privada",
    );

    expect(
      [1, 2, 3].map((n) => within(question(n)).getByText(/^Vale /).textContent),
    ).toEqual(["Vale 2,50", "Vale 2,50", "Vale 2,50"]);
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));

    await vi.waitFor(() =>
      expect(router.push).toHaveBeenCalledWith("/trabalhos?criado=1"),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]!.url).toBe("/api/works");
    expect(writes[0]!.body).toEqual({
      subjectId: POO.id,
      title: "Trabalho de herança",
      difficulty: null,
      totalGrade: "7.5",
      topics: null,
      status: "APPROVED",
      questions: [
        {
          type: "OPEN_ANSWER",
          statement: "Pergunta 1",
          topicItemIds: [],
          expectedAnswer: "Resposta",
        },
        {
          type: "MULTIPLE_CHOICE",
          statement: "Escolha 2",
          topicItemIds: [],
          alternatives: [
            { text: "extends", isCorrect: true },
            { text: "implements", isCorrect: false },
            { text: "inherits", isCorrect: false },
          ],
          isTrickQuestion: true,
        },
        {
          type: "CODE",
          statement: "Código 3",
          topicItemIds: [],
          expectedSolution: "class A {}",
          languageId: JAVA.id,
          testCases: [
            { input: "1", expectedOutput: "2", visibility: "PRIVATE" },
          ],
        },
      ],
    });
  }, 15_000);

  it('011/FR-014 "Salvar como rascunho" envia DRAFT, com a dificuldade escolhida', async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await fillHeader(user);
    await user.selectOptions(screen.getByLabelText(/^Dificuldade/), "Avançado");
    await fillOpenAnswer(user, 1);
    await user.click(
      screen.getByRole("button", { name: "Salvar como rascunho" }),
    );
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toMatchObject({
      status: "DRAFT",
      difficulty: "ADVANCED",
    });
  });

  it("011/FR-008 campos vazios: erro por campo, ligado ao campo e no resumo com o número da questão, sem chamar a API", async () => {
    const { container } = renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await addQuestion(user);
    await user.selectOptions(
      within(question(2)).getByLabelText(/^Tipo/),
      "Código",
    );
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));

    const summary = await screen.findByRole("group", { name: summaryTitle });
    for (const text of [
      "Escolha a disciplina.",
      "Informe o título.",
      "Informe a nota total.",
      "Questão 1: Informe o enunciado.",
      "Questão 1: Informe a resposta esperada.",
      "Questão 2: Informe a solução esperada.",
      "Questão 2: Escolha a linguagem.",
    ]) {
      expect(summary.textContent).toContain(text);
    }
    for (const label of [/^Disciplina/, /^Título/, /^Nota total/])
      expectFieldErrorLinked(screen.getByLabelText(label));
    expectFieldErrorLinked(
      within(question(1)).getByLabelText(/^Resposta esperada/),
    );
    expectFieldErrorLinked(
      within(question(2)).getByLabelText(/^Solução esperada/),
    );
    expectFieldErrorLinked(within(question(2)).getByLabelText(/^Linguagem/));
    expect(writes).toHaveLength(0);
    await expectNoA11yViolations(container);
  });

  it("011/US1-3 múltipla escolha sem a correta ou com textos repetidos é recusada no formulário, indicando a questão", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await fillHeader(user);
    await fillMultipleChoice(user, 1, null);
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));

    const summary = await screen.findByRole("group", { name: summaryTitle });
    expect(summary.textContent).toContain(
      "Questão 1: Marque a alternativa correta.",
    );
    expectFieldErrorLinked(
      within(question(1)).getByRole("radio", {
        name: "Correta (alternativa 1)",
      }),
    );

    const third = within(question(1)).getByLabelText(/^Alternativa 3/);
    await user.clear(third);
    await user.type(third, "EXTENDS");
    await user.click(
      within(question(1)).getByRole("radio", {
        name: "Correta (alternativa 1)",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    await vi.waitFor(() =>
      expect(
        screen.getByRole("group", { name: summaryTitle }).textContent,
      ).toContain(
        "Questão 1: As alternativas não podem repetir o mesmo texto.",
      ),
    );
    expect(writes).toHaveLength(0);
  });

  it("011/FR-006 alternativas: de 3 a 5, e a marca de correta acompanha a alternativa removida", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await user.selectOptions(
      within(question(1)).getByLabelText(/^Tipo/),
      "Múltipla escolha",
    );
    const scope = within(question(1));
    const add = scope.getByRole("button", { name: "Adicionar alternativa" });
    expect(
      (
        scope.getByRole("button", {
          name: "Remover alternativa 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.click(add);
    await user.click(add);
    expect(scope.getAllByLabelText(/^Alternativa \d/)).toHaveLength(5);
    expect((add as HTMLButtonElement).disabled).toBe(true);

    await user.click(
      scope.getByRole("radio", { name: "Correta (alternativa 5)" }),
    );
    await user.click(
      scope.getByRole("button", { name: "Remover alternativa 2" }),
    );
    expect(
      (
        scope.getByRole("radio", {
          name: "Correta (alternativa 4)",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
  });

  it('011/FR-011 nota com vírgula: "0,5" vira "0.5"; mais de duas casas ou menos de 0,01 por questão é recusado no campo', async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await fillHeader(user, "1,234");
    await fillOpenAnswer(user, 1);
    expect(within(question(1)).queryByText(/^Vale /)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    expect(
      (await screen.findByRole("group", { name: summaryTitle })).textContent,
    ).toContain(
      "Informe a nota de 0,01 a 100,00, com até duas casas decimais.",
    );
    expectFieldErrorLinked(screen.getByLabelText(/^Nota total/));

    const grade = screen.getByLabelText(/^Nota total/);
    await user.clear(grade);
    await user.type(grade, "0,01");
    await addQuestion(user);
    await fillOpenAnswer(user, 2);
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    await vi.waitFor(() =>
      expect(
        screen.getByRole("group", { name: summaryTitle }).textContent,
      ).toContain(
        "A nota total precisa dar pelo menos 0,01 para cada questão.",
      ),
    );
    expect(writes).toHaveLength(0);

    await user.clear(grade);
    await user.type(grade, "0,5");
    expect(within(question(1)).getByText(/^Vale /).textContent).toBe(
      "Vale 0,25",
    );
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toMatchObject({ totalGrade: "0.5" });
  });

  it("011/US1-5 tópicos da ementa confirmada: até 10 no trabalho, e cada questão aponta até 3 deles", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await fillHeader(user);
    await vi.waitFor(() =>
      expect(screen.getByRole("option", { name: "Versão 1" })).toBeTruthy(),
    );
    await user.selectOptions(screen.getByLabelText(/^Ementa/), "Versão 1");
    const topics = await screen.findByRole("group", {
      name: "Tópicos do trabalho",
    });
    for (const text of ["Listas", "Herança", "Polimorfismo", "Interfaces"])
      await user.click(within(topics).getByLabelText(text));

    await fillOpenAnswer(user, 1);
    const questionTopics = within(question(1));
    expect(
      questionTopics
        .getAllByRole("checkbox")
        .map((box) => box.closest("div")!.textContent),
    ).toEqual(["Listas", "Herança", "Polimorfismo", "Interfaces"]);
    for (const text of ["Herança", "Polimorfismo", "Interfaces"])
      await user.click(questionTopics.getByLabelText(text));
    expect(
      (questionTopics.getByLabelText("Listas") as HTMLInputElement).disabled,
    ).toBe(true);
    // A topic unchecked from the work leaves the question too.
    await user.click(within(topics).getByLabelText("Interfaces"));

    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toMatchObject({
      topics: {
        syllabusRevisionId: expect.any(String),
        syllabusItemIds: [
          itemId("Listas"),
          itemId("Herança"),
          itemId("Polimorfismo"),
        ],
      },
      questions: [
        { topicItemIds: [itemId("Herança"), itemId("Polimorfismo")] },
      ],
    });
  });

  it("011/FR-007 questão de código sem casos de teste: o aviso aparece antes de salvar e aprovar", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await fillHeader(user);
    await fillCode(user, 1);
    expect(
      screen.getByText(/A questão 1 é de código sem casos de teste/),
    ).toBeTruthy();
    await user.click(
      within(question(1)).getByRole("button", {
        name: "Adicionar caso de teste",
      }),
    );
    expect(screen.queryByText(/de código sem casos de teste/)).toBeNull();
  });

  it("011/FR-005 mover para cima e para baixo muda a ordem das questões e o foco acompanha a questão", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await addQuestion(user);
    await user.type(
      within(question(1)).getByLabelText(/^Enunciado/),
      "Primeira",
    );
    await user.type(
      within(question(2)).getByLabelText(/^Enunciado/),
      "Segunda",
    );
    expect(
      (
        within(question(1)).getByRole("button", {
          name: "Mover para cima Questão 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    await user.click(
      within(question(2)).getByRole("button", {
        name: "Mover para cima Questão 2",
      }),
    );
    expect(
      (within(question(1)).getByLabelText(/^Enunciado/) as HTMLTextAreaElement)
        .value,
    ).toBe("Segunda");
    expect(
      (within(question(2)).getByLabelText(/^Enunciado/) as HTMLTextAreaElement)
        .value,
    ).toBe("Primeira");
    expect(document.activeElement).toBe(
      within(question(1)).getByRole("button", {
        name: "Mover para baixo Questão 1",
      }),
    );
  });

  it("011/US1-4 erro da API aparece no resumo, sem sair da página", async () => {
    fetchMock.mockImplementation(
      workApiMock(() => apiError(404, "NOT_FOUND", "Não encontrado.")),
    );
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await fillHeader(user);
    await fillOpenAnswer(user, 1);
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    const summary = await screen.findByRole("group", { name: summaryTitle });
    expect(summary.textContent).not.toBe("");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("SC-012 a ordem de Tab segue o cabeçalho, a questão e termina nos botões de salvar", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    const scope = within(question(1));
    await expectTabOrder(user, [
      screen.getByLabelText(/^Disciplina/),
      screen.getByLabelText(/^Título/),
      screen.getByLabelText(/^Descrição/),
      screen.getByLabelText(/^Nota total/),
      screen.getByLabelText(/^Dificuldade/),
      scope.getByLabelText(/^Tipo/),
      scope.getByLabelText(/^Enunciado/),
      scope.getByLabelText(/^Resposta esperada/),
      scope.getByLabelText(/^Rubrica/),
      scope.getByLabelText(/^Explicação/),
      screen.getByRole("button", { name: "Adicionar questão" }),
      screen.getByRole("button", { name: "Salvar e aprovar" }),
      screen.getByRole("button", { name: "Salvar como rascunho" }),
    ]);
  });
});

describe("011/US2 WorkForm — valor de cada questão", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(workApiMock(() => json(201, workView()))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const values = () =>
    screen
      .getAllByRole("group", { name: /^Questão \d+$/ })
      .map((card) => within(card).queryByText(/^Vale /)?.textContent ?? null);
  const statement = (n: number) =>
    (within(question(n)).getByLabelText(/^Enunciado/) as HTMLTextAreaElement)
      .value;

  it('011/US2-3 011/US2-4 011/FR-012 cada cartão mostra "Vale 0,17" e recalcula ao mudar a nota, acrescentar, remover ou reordenar', async () => {
    const { container } = renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    const grade = screen.getByLabelText(/^Nota total/);
    await user.type(grade, "0,50");
    expect(values()).toEqual(["Vale 0,50"]);

    await addQuestion(user);
    await addQuestion(user);
    expect(values()).toEqual(["Vale 0,17", "Vale 0,17", "Vale 0,16"]);
    await expectNoA11yViolations(container);
    for (const [n, text] of ["Primeira", "Segunda", "Terceira"].entries())
      await user.type(
        within(question(n + 1)).getByLabelText(/^Enunciado/),
        text,
      );

    // The value follows the position, not the question: the moved one takes its new place's value.
    await user.click(
      within(question(3)).getByRole("button", {
        name: "Mover para cima Questão 3",
      }),
    );
    expect(statement(2)).toBe("Terceira");
    expect(statement(3)).toBe("Segunda");
    expect(values()).toEqual(["Vale 0,17", "Vale 0,17", "Vale 0,16"]);

    await addQuestion(user);
    expect(values()).toEqual([
      "Vale 0,13",
      "Vale 0,13",
      "Vale 0,12",
      "Vale 0,12",
    ]);

    await user.click(screen.getByRole("button", { name: "Remover Questão 1" }));
    expect(statement(1)).toBe("Terceira");
    expect(values()).toEqual(["Vale 0,17", "Vale 0,17", "Vale 0,16"]);

    await user.clear(grade);
    await user.type(grade, "1");
    expect(values()).toEqual(["Vale 0,34", "Vale 0,33", "Vale 0,33"]);
    await user.clear(grade);
    await user.type(grade, "10,00");
    expect(values()).toEqual(["Vale 3,34", "Vale 3,33", "Vale 3,33"]);
  });

  it("011/US2-5 sem nota válida, ou com menos de 0,01 por questão, nenhum cartão mostra valor", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    expect(values()).toEqual([null]);
    const grade = screen.getByLabelText(/^Nota total/);
    for (const invalid of ["0,505", "0", "100,01", "-1", "abc"]) {
      await user.clear(grade);
      await user.type(grade, invalid);
      expect(values(), invalid).toEqual([null]);
    }
    await user.clear(grade);
    await user.type(grade, "0,02");
    await addQuestion(user);
    expect(values()).toEqual(["Vale 0,01", "Vale 0,01"]);
    await addQuestion(user);
    expect(values()).toEqual([null, null, null]);
  });
});

describe("014/US3 WorkForm — a questão de Código com o código colorido", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    fetchMock.mockImplementation(
      workApiMock((url, body) => {
        writes.push({ url, body });
        return json(201, workView());
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Question 1 as Código in `language`; its two code editors once CodeMirror has loaded. */
  async function codeQuestion(user: UserEvent, language: string) {
    const scope = within(question(1));
    await user.selectOptions(scope.getByLabelText(/^Tipo/), "Código");
    await scope.findByRole("option", { name: language });
    await user.selectOptions(scope.getByRole("combobox", { name: /^Linguagem/ }), language);
    return {
      starter: await codeEditorByLabel(/^Código inicial/, question(1)),
      solution: await codeEditorByLabel(/^Solução esperada/, question(1)),
    };
  }

  it("014/US3-1 014/US3-2 os campos de código usam a gramática da linguagem escolhida, e trocá-la muda o realce sem mudar o texto", async () => {
    const { container } = renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    const { starter, solution } = await codeQuestion(user, "Python");
    starter.focus();
    await typeCode(user, "def main():");
    solution.focus();
    await typeCode(user, "def f(): // nota");
    await waitFor(() => expect(syntaxSegments(solution)).toEqual(expect.arrayContaining([["def", "text-syntax-keyword"]])));
    expect(syntaxSegments(starter)).toEqual(expect.arrayContaining([["def", "text-syntax-keyword"]]));
    expect(solution.closest(".cm-editor")!.querySelector(".cm-lineNumbers")).toBeTruthy();

    await user.selectOptions(within(question(1)).getByRole("combobox", { name: /^Linguagem/ }), "Java");
    await waitFor(() => expect(syntaxSegments(solution)).toEqual(expect.arrayContaining([["// nota", "text-syntax-comment"]])));
    expect(syntaxSegments(solution)).not.toEqual(expect.arrayContaining([["def", "text-syntax-keyword"]]));
    expect(codeMirrorText(solution)).toBe("def f(): // nota");
    expect(codeMirrorText(starter)).toBe("def main():");
    await expectNoA11yViolations(container);
  });

  it("014/US3-3 solução vazia: erro ligado ao editor e o link do resumo leva o foco a ele", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    const { solution } = await codeQuestion(user, "Java");
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    const summary = await screen.findByRole("group", { name: summaryTitle });
    await waitFor(() => expectFieldErrorLinked(solution));
    await user.click(within(summary).getByRole("link", { name: "Questão 1: Informe a solução esperada." }));
    expect(document.activeElement).toBe(solution);
    expect(writes).toHaveLength(0);
  });

  it("014/US3-4 o corpo enviado traz o texto exato do código", async () => {
    renderWithProviders(<WorkForm />);
    const user = userEvent.setup();
    await fillHeader(user);
    await user.type(within(question(1)).getByLabelText(/^Enunciado/), "Some");
    const { starter, solution } = await codeQuestion(user, "Python");
    starter.focus();
    await typeCode(user, "def soma(a, b):\n");
    await user.keyboard("{Tab}");
    await typeCode(user, "pass  ");
    solution.focus();
    await typeCode(user, "def soma(a, b):\n");
    await user.keyboard("{Tab}");
    await typeCode(user, "return a + b  # ação {ok}");
    await user.click(screen.getByRole("button", { name: "Salvar como rascunho" }));

    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect((writes[0]!.body as { questions: object[] }).questions[0]).toMatchObject({
      type: "CODE",
      starterCode: "def soma(a, b):\n  pass  ",
      expectedSolution: "def soma(a, b):\n  return a + b  # ação {ok}",
      languageId: PYTHON.id,
    });
  });

  it("014/US3-1 trabalho arquivado: código inicial e solução coloridos e não editáveis", async () => {
    const onSave = vi.fn();
    const work = workView({
      status: "ARCHIVED",
      archivedFromStatus: "APPROVED",
      questions: [
        {
          id: "00000000-0000-4000-e000-000000000003",
          position: 0,
          type: "CODE",
          gradingStrategy: "TEST_CASES",
          value: "10.00",
          statement: "Implemente.",
          explanation: null,
          topicItemIds: [],
          isTrickQuestion: false,
          instructions: null,
          starterCode: "class A {\n}",
          expectedSolution: "class B extends A {} // ok",
          language: { id: JAVA.id, name: JAVA.name, highlight: "java" },
          testCases: [],
        },
      ],
    });
    const { container } = renderWithProviders(<WorkForm edit={{ work, onSave, readOnly: true }} />);
    const user = userEvent.setup();
    const starter = await codeEditorByLabel(/^Código inicial/);
    const solution = await codeEditorByLabel(/^Solução esperada/);
    await waitFor(() => expect(syntaxSegments(solution)).toEqual(expect.arrayContaining([["extends", "text-syntax-keyword"], ["// ok", "text-syntax-comment"]])));
    for (const editor of [starter, solution]) {
      expect(editor.getAttribute("contenteditable")).not.toBe("true");
      expect(editor.getAttribute("aria-disabled")).toBe("true");
      expect(editor.getAttribute("aria-readonly")).toBe("true");
    }
    solution.focus();
    await typeCode(user, "x");
    expect(codeMirrorText(solution)).toBe("class B extends A {} // ok");
    expect(codeMirrorText(starter)).toBe("class A {\n}");
    expect(onSave).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });
});
