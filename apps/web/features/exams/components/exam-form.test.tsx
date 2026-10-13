import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { codeEditorByLabel, typeCode } from "../../../test/code-editor";
import { expectFieldErrorLinked } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { ExamForm } from "./exam-form";
import { examApiMock, examView, itemId, json, POO } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const question = (n: number) => screen.getByRole("group", { name: `Questão ${n}` });
const summaryTitle = "Não foi possível salvar a prova";

async function fillHeader(user: UserEvent, totalGrade = "10") {
  await screen.findByRole("option", { name: POO.name });
  await user.selectOptions(screen.getByRole("combobox", { name: /^Disciplina/ }), POO.name);
  await user.type(screen.getByLabelText(/^Título/), "Prova de herança");
  await user.type(screen.getByLabelText(/^Nota total/), totalGrade);
  await screen.findByRole("option", { name: "Versão 1" });
  await user.selectOptions(screen.getByRole("combobox", { name: /^Ementa/ }), "Versão 1");
  await user.click(await screen.findByRole("checkbox", { name: "Herança" }));
}

async function fillOpenAnswer(user: UserEvent, n: number, difficulty: string | null = "Básico") {
  const scope = within(question(n));
  await user.selectOptions(scope.getByLabelText(/^Tipo/), "Pergunta e resposta");
  await user.type(scope.getByLabelText(/^Enunciado/), `Pergunta ${n}`);
  await user.type(scope.getByLabelText(/^Resposta esperada/), "Resposta");
  if (difficulty) await user.selectOptions(scope.getByLabelText(/^Dificuldade/), difficulty);
}

const addQuestion = (user: UserEvent) => user.click(screen.getByRole("button", { name: "Adicionar questão" }));

describe("018/US1 ExamForm — criar uma prova manualmente", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { url: string; body: unknown }[] = [];

  beforeEach(() => {
    fetchMock.mockReset();
    router.push.mockReset();
    writes.length = 0;
    fetchMock.mockImplementation(
      examApiMock((url, body) => {
        writes.push({ url, body });
        return json(201, examView());
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("018/US1-1 salva e aprova uma prova com uma questão de cada tipo, dificuldade e tópico, com os valores só para leitura", async () => {
    const { container } = renderWithProviders(<ExamForm />);
    const user = userEvent.setup();
    await fillHeader(user);
    await addQuestion(user);
    await addQuestion(user);
    await fillOpenAnswer(user, 1);

    const second = within(question(2));
    await user.selectOptions(second.getByLabelText(/^Tipo/), "Múltipla escolha");
    await user.type(second.getByLabelText(/^Enunciado/), "Escolha");
    for (const [index, text] of ["extends", "implements", "inherits"].entries()) {
      await user.type(second.getByLabelText(new RegExp(`^Alternativa ${index + 1}`)), text);
    }
    await user.click(second.getByRole("radio", { name: "Correta (alternativa 1)" }));
    await user.selectOptions(second.getByLabelText(/^Dificuldade/), "Intermediário");

    const third = within(question(3));
    await user.selectOptions(third.getByLabelText(/^Tipo/), "Código");
    await user.type(third.getByLabelText(/^Enunciado/), "Some dois números");
    (await codeEditorByLabel(/^Solução esperada/, question(3))).focus();
    await typeCode(user, "class A {}");
    await third.findByRole("option", { name: "Java" });
    await user.selectOptions(third.getByRole("combobox", { name: /^Linguagem/ }), "Java");
    await user.selectOptions(third.getByLabelText(/^Dificuldade/), "Avançado");

    // The values come from the total, shown, never typed.
    expect(["Vale 3,34", "Vale 3,33", "Vale 3,33"].every((text, index) => within(question(index + 1)).getByText(text))).toBe(true);
    // A single exam topic is checked on every new question.
    expect((within(question(2)).getByRole("checkbox", { name: "Herança" }) as HTMLInputElement).checked).toBe(true);
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/provas?criada=1"));
    expect(writes).toHaveLength(1);
    expect(writes[0]!.url).toBe("/api/exams");
    expect(writes[0]!.body).toMatchObject({
      subjectId: POO.id,
      saveAs: "APPROVED",
      totalGrade: "10",
      topicIds: [itemId("Herança")],
      questions: [
        { type: "OPEN_ANSWER", difficulty: "BASIC", topicIds: [itemId("Herança")] },
        { type: "MULTIPLE_CHOICE", difficulty: "INTERMEDIATE" },
        { type: "CODE", difficulty: "ADVANCED", languageId: expect.any(String) },
      ],
    });
  });

  it("018/US1-2 aprovar sem dificuldade é barrado na questão; o rascunho pode ficar sem ela", async () => {
    renderWithProviders(<ExamForm />);
    const user = userEvent.setup();
    await fillHeader(user);
    await fillOpenAnswer(user, 1, null);

    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    const summary = await screen.findByRole("group", { name: summaryTitle });
    expect(within(summary).getByText(summaryTitle)).toBeTruthy();
    expect(within(summary).getByRole("link", { name: "Questão 1: Escolha a dificuldade." })).toBeTruthy();
    expectFieldErrorLinked(within(question(1)).getByLabelText(/^Dificuldade/));
    expect(writes).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Salvar como rascunho" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toMatchObject({ saveAs: "DRAFT", questions: [{ difficulty: null }] });
  });

  it("018/FR-002 a prova precisa de ementa e tópicos; a questão, de 1 a 3 tópicos da prova", async () => {
    renderWithProviders(<ExamForm />);
    const user = userEvent.setup();
    await screen.findByRole("option", { name: POO.name });
    await user.selectOptions(screen.getByRole("combobox", { name: /^Disciplina/ }), POO.name);
    await user.type(screen.getByLabelText(/^Título/), "Prova");
    await user.type(screen.getByLabelText(/^Nota total/), "10");
    await fillOpenAnswer(user, 1, "Básico");
    await user.click(screen.getByRole("button", { name: "Salvar como rascunho" }));
    const summary = await screen.findByRole("group", { name: summaryTitle });
    expect(within(summary).getByRole("link", { name: "Escolha a ementa." })).toBeTruthy();
    expect(within(summary).getByRole("link", { name: "Escolha de 1 a 20 tópicos da ementa." })).toBeTruthy();
    expect(within(summary).getByRole("link", { name: "Questão 1: Escolha de 1 a 3 tópicos da prova." })).toBeTruthy();
    expect(writes).toHaveLength(0);
  });

  it("018/US1-3 018/FR-001 de 1 a 20 questões: acrescenta até 20 e não remove abaixo de 1", async () => {
    renderWithProviders(<ExamForm />);
    const user = userEvent.setup();
    expect(screen.queryByRole("button", { name: /^Remover Questão/ })).toBeNull();
    const add = screen.getByRole("button", { name: "Adicionar questão" });
    for (let i = 0; i < 19; i += 1) await user.click(add);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(20);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("20 de 20")).toBeTruthy();
  });

  it("018/US1-2 a recusa do servidor (EXAM_RULES) aponta a questão com um link para ela", async () => {
    fetchMock.mockImplementation(
      examApiMock(() =>
        json(422, {
          statusCode: 422,
          code: "EXAM_RULES",
          message: "Revise as questões destacadas antes de salvar.",
          details: { violations: [{ position: 0, field: "difficulty", reason: "DIFFICULTY_MISSING" }] },
        }),
      ),
    );
    renderWithProviders(<ExamForm />);
    const user = userEvent.setup();
    await fillHeader(user);
    await fillOpenAnswer(user, 1);
    await user.click(screen.getByRole("button", { name: "Salvar e aprovar" }));
    const link = await screen.findByRole("link", { name: "Questão 1: sem dificuldade." });
    expect(link.getAttribute("href")).toBe("#questao-1");
    expect(router.push).not.toHaveBeenCalled();
  });
});
