import type { WorkStudentView } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { StudentPreview } from "./student-preview";
import { apiError, json } from "./test-fixtures";

const WORK_ID = "00000000-0000-4000-e000-000000000001";

/** What `GET /works/:id/student-preview` answers: the server's allowlist, no answer key. */
const PREVIEW: WorkStudentView = {
  id: WORK_ID,
  title: "Trabalho de herança",
  description: "Leia com atenção.",
  totalGrade: "0.50",
  questions: [
    {
      id: "00000000-0000-4000-e000-000000000011",
      position: 0,
      type: "OPEN_ANSWER",
      value: "0.17",
      statement: "O que é herança?",
    },
    {
      id: "00000000-0000-4000-e000-000000000012",
      position: 1,
      type: "MULTIPLE_CHOICE",
      value: "0.17",
      statement: "Qual palavra-chave declara herança em Java?",
      alternatives: [
        { id: "00000000-0000-4000-e000-000000000021", text: "implements" },
        { id: "00000000-0000-4000-e000-000000000022", text: "extends" },
        { id: "00000000-0000-4000-e000-000000000023", text: "inherits" },
      ],
    },
    {
      id: "00000000-0000-4000-e000-000000000013",
      position: 2,
      type: "CODE",
      value: "0.16",
      statement: "Implemente a classe Cachorro.",
      instructions: "Cachorro deve estender Animal.",
      starterCode: "class Cachorro {}",
      language: { name: "Java", highlight: "java" },
      publicTestCases: [{ input: "falar()", expectedOutput: "au" }],
    },
  ],
};

/** Fields of the teacher view that must never be drawn, even if a response carried them. */
const LEAKED = {
  expectedAnswer: "MARCADOR-RESPOSTA-011",
  rubric: "MARCADOR-RUBRICA-011",
  expectedSolution: "MARCADOR-SOLUCAO-011",
  explanation: "MARCADOR-EXPLICACAO-011",
  isTrickQuestion: true,
  gradingStrategy: "AI_REVIEW",
  testCases: [
    {
      input: "MARCADOR-PRIVADO-011",
      expectedOutput: "MARCADOR-PRIVADO-011",
      visibility: "PRIVATE",
    },
  ],
};

describe("011/US6 StudentPreview — Ver como aluno", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const serve = (body: unknown) =>
    fetchMock.mockImplementation(async (input) =>
      String(input) === `/api/works/${WORK_ID}/student-preview`
        ? json(200, body)
        : apiError(404, "NOT_FOUND", "Não encontrado."),
    );

  it("011/US6-1 011/US6-2 011/US6-3 mostra enunciado, valor, alternativas na ordem, instruções, código inicial, linguagem e casos públicos, somente leitura", async () => {
    serve(PREVIEW);
    const { container } = renderWithProviders(
      <StudentPreview workId={WORK_ID} />,
    );
    const section = await screen.findByRole("region", {
      name: "Trabalho de herança",
    });
    expect(
      within(section).getByText("Visão do aluno (somente leitura)"),
    ).toBeTruthy();
    expect(within(section).getByText("Nota total: 0,50")).toBeTruthy();

    const questions = screen.getAllByRole("article");
    expect(
      questions.map(
        (q) => within(q).getByRole("heading", { level: 3 }).textContent,
      ),
    ).toEqual(["Questão 1", "Questão 2", "Questão 3"]);
    expect(
      within(questions[0]!).getByText("Pergunta e resposta · Vale 0,17"),
    ).toBeTruthy();
    expect(
      within(questions[1]!).getByText("Múltipla escolha · Vale 0,17"),
    ).toBeTruthy();
    expect(within(questions[2]!).getByText("Código · Vale 0,16")).toBeTruthy();
    expect(
      within(questions[1]!)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["implements", "extends", "inherits"]);
    expect(
      within(questions[2]!).getByText("Cachorro deve estender Animal."),
    ).toBeTruthy();
    expect(
      within(questions[2]!)
        .getByRole("group", { name: "Código inicial" })
        .querySelector("pre code")!.textContent,
    ).toBe("class Cachorro {}");
    expect(within(questions[2]!).getByText("Java")).toBeTruthy();
    expect(
      within(questions[2]!).getByText("Entrada: falar() · Saída esperada: au"),
    ).toBeTruthy();

    // Read-only: nothing to answer or mark, and no "correta".
    for (const role of ["textbox", "radio", "checkbox", "combobox", "button"])
      expect(screen.queryByRole(role)).toBeNull();
    expect(container.textContent).not.toMatch(
      /correta|Resposta esperada|Solução esperada|Explicação|Pegadinha|Rubrica|Privada/i,
    );
    await expectNoA11yViolations(container);
  });

  it("011/US6-5 011/SC-007 nenhum campo de gabarito é desenhado, mesmo que a resposta o trouxesse", async () => {
    serve({
      ...PREVIEW,
      origin: "AI_GENERATED",
      questions: PREVIEW.questions.map((question) => ({
        ...question,
        ...LEAKED,
        alternatives: question.alternatives?.map((alternative, index) => ({
          ...alternative,
          isCorrect: index === 1,
        })),
      })),
    });
    const { container } = renderWithProviders(
      <StudentPreview workId={WORK_ID} />,
    );
    await screen.findByRole("region", { name: "Trabalho de herança" });
    expect(container.textContent).not.toMatch(
      /MARCADOR-|correta|Gerado por IA|Pegadinha/i,
    );
    expect(container.innerHTML).not.toContain("MARCADOR-");
  });

  it("erro da API aparece como alerta", async () => {
    fetchMock.mockImplementation(async () =>
      apiError(404, "NOT_FOUND", "Não encontrado."),
    );
    renderWithProviders(<StudentPreview workId={WORK_ID} />);
    expect((await screen.findByRole("alert")).textContent).not.toBe("");
  });

  it("014/US2-3 \"Ver como aluno\" mostra o código inicial colorido e continua sem a solução", async () => {
    serve({
      ...PREVIEW,
      questions: PREVIEW.questions.map((question) => ({ ...question, ...LEAKED })),
    });
    const { container } = renderWithProviders(
      <StudentPreview workId={WORK_ID} />,
    );
    const starter = await screen.findByRole("group", {
      name: "Código inicial",
    });
    await waitFor(() =>
      expect(starter.querySelector(".text-syntax-keyword")).toBeTruthy(),
    );
    expect(starter.querySelector("pre code")!.textContent).toBe(
      "class Cachorro {}",
    );
    expect(screen.queryByRole("group", { name: "Solução esperada" })).toBeNull();
    expect(container.textContent).not.toMatch(/MARCADOR-SOLUCAO-011/);
    expect(container.querySelector("textarea, [contenteditable]")).toBeNull();
  });
});
