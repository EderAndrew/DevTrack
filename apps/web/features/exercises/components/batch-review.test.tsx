import type { ExerciseBatchDetail } from "@repo/contracts";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { codeEditorByLabel, codeMirrorText, syntaxSegments, typeCode } from "../../../test/code-editor";
import { expectFieldErrorLinked, expectTabOrder } from "../../../test/keyboard";
import { renderWithProviders } from "../../../test/render";
import { BatchReview } from "./batch-review";
import { apiError, batchView, exerciseView, JAVA, json, POO_REVISION } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const BATCH_ID = "00000000-0000-4000-d000-000000000001";
const topic = {
  syllabusItemId: POO_REVISION.groups[0]!.items[0]!.id,
  itemText: "Herança",
  subjectId: POO_REVISION.id,
  subjectName: "POO",
  syllabusRevisionId: POO_REVISION.id,
};
const ai = { origin: "AI_GENERATED", status: "DRAFT", batchId: BATCH_ID, topic, version: 3 } as const;

const openAnswer = exerciseView({ ...ai, statement: "O que é herança?", expectedAnswer: "Reuso por extensão" });
const multipleChoice = exerciseView({
  ...ai,
  type: "MULTIPLE_CHOICE",
  statement: "Qual palavra-chave estende uma classe?",
  expectedAnswer: null,
  isTrickQuestion: true,
  humanEdited: true,
  alternatives: [
    { id: "00000000-0000-4000-e000-000000000001", text: "extends", isCorrect: true, position: 0 },
    { id: "00000000-0000-4000-e000-000000000002", text: "implements", isCorrect: false, position: 1 },
    { id: "00000000-0000-4000-e000-000000000003", text: "super", isCorrect: false, position: 2 },
  ],
});
const approved = exerciseView({ ...ai, status: "APPROVED", statement: "Já aprovado", humanReviewed: true });

describe("010/US4 BatchReview — revisar o lote gerado", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { method: string; url: string; body: unknown }[] = [];
  let detail: ExerciseBatchDetail;
  let answer: (method: string, url: string) => Response;

  beforeEach(() => {
    router.push.mockReset();
    writes.length = 0;
    detail = { batch: batchView({ id: BATCH_ID, status: "GENERATED", pendingReview: 2, approved: 1, total: 3 }), exercises: [openAnswer, multipleChoice, approved] };
    answer = (method) => (method === "DELETE" ? new Response(null, { status: 204 }) : json(200, openAnswer));
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "GET") return url === `/api/exercise-batches/${BATCH_ID}` ? json(200, detail) : apiError(404, "NOT_FOUND", "Não encontrado.");
      writes.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return answer(method, url);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const card = async (n: number) => screen.findByRole("group", { name: new RegExp(`^Exercício ${n} —`) });

  it("mostra a situação, os rascunhos e os selos em palavras; sem violações de acessibilidade", async () => {
    const { container } = renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const second = await card(2);
    expect(screen.getByText("Gerado")).toBeTruthy();
    expect(screen.getByText(/2 para revisar · 1 aprovado · 0 excluídos/)).toBeTruthy();
    expect(within(second).getByText("Gerado por IA")).toBeTruthy();
    expect(within(second).getByText("Editado por você")).toBeTruthy();
    expect(within(second).getByText("Pegadinha")).toBeTruthy();
    expect(within(second).getByText("Rascunho")).toBeTruthy();
    // Only drafts can be reviewed.
    expect(within(await card(3)).queryByRole("button", { name: /Aprovar/ })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("010/US4-1 aprova um rascunho com a versão que leu", async () => {
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const user = userEvent.setup();
    await user.click(within(await card(1)).getByRole("button", { name: "Aprovar exercício 1" }));
    await screen.findByText("Exercício 1 aprovado.");
    expect(writes).toEqual([{ method: "POST", url: `/api/exercises/${openAnswer.id}/approve`, body: { version: 3 } }]);
  });

  it("010/FR-014 aprova os selecionados de uma vez", async () => {
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const user = userEvent.setup();
    const approveSelected = await screen.findByRole("button", { name: "Aprovar selecionados (0)" });
    expect(approveSelected).toHaveProperty("disabled", true);
    await user.click(screen.getByLabelText("Selecionar exercício 1"));
    await user.click(screen.getByLabelText("Selecionar exercício 2"));
    answer = () => json(200, { items: [openAnswer, multipleChoice] });
    await user.click(screen.getByRole("button", { name: "Aprovar selecionados (2)" }));
    await screen.findByText("2 exercícios aprovados.");
    expect(writes).toEqual([{ method: "POST", url: `/api/exercise-batches/${BATCH_ID}/approve`, body: { exerciseIds: [openAnswer.id, multipleChoice.id] } }]);
  });

  it("010/US4-2 edita um rascunho no lugar e envia o conteúdo com a versão", async () => {
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const user = userEvent.setup();
    await user.click(within(await card(2)).getByRole("button", { name: "Editar exercício 2" }));
    const statement = screen.getByLabelText(/^Enunciado/);
    await user.clear(statement);
    await user.type(statement, "Qual palavra-chave cria uma subclasse?");
    await user.click(screen.getByLabelText("Correta (alternativa 2)"));
    await user.click(screen.getByLabelText("Correta (alternativa 1)"));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await screen.findByText("Exercício 2 salvo.");
    expect(writes).toEqual([
      {
        method: "PUT",
        url: `/api/exercises/${multipleChoice.id}`,
        body: {
          type: "MULTIPLE_CHOICE",
          statement: "Qual palavra-chave cria uma subclasse?",
          explanation: multipleChoice.explanation,
          difficulty: multipleChoice.difficulty,
          cognitiveObjective: multipleChoice.cognitiveObjective,
          syllabusItemId: topic.syllabusItemId,
          alternatives: [
            { text: "extends", isCorrect: true },
            { text: "implements", isCorrect: false },
            { text: "super", isCorrect: false },
          ],
          isTrickQuestion: true,
          version: 3,
        },
      },
    ]);
  });

  it("010/US4-4 edição que quebra uma regra não é enviada; a recusa do servidor aparece e o exercício fica como estava", async () => {
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const user = userEvent.setup();
    await user.click(within(await card(1)).getByRole("button", { name: "Editar exercício 1" }));
    await user.clear(screen.getByLabelText(/^Enunciado/));
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Corrija os itens abaixo")).toBeTruthy();
    expect(screen.getAllByText("Informe o enunciado.").length).toBeGreaterThan(0);
    expect(writes).toEqual([]);

    await user.type(screen.getByLabelText(/^Enunciado/), "Outro enunciado");
    answer = () => apiError(409, "EXERCISE_VERSION_CONFLICT", "conflito");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText(/Este exercício foi alterado depois que você o abriu/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salvar alterações" })).toBeTruthy();
  });

  it("010/US4-3 excluir pede confirmação e envia a versão", async () => {
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const user = userEvent.setup();
    await user.click(within(await card(1)).getByRole("button", { name: "Excluir exercício 1" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Excluir o exercício 1?" });
    expect(writes).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Excluir exercício" }));
    await screen.findByText("Exercício 1 excluído.");
    expect(writes).toEqual([{ method: "DELETE", url: `/api/exercises/${openAnswer.id}`, body: { version: 3 } }]);
  });

  it("gerando: avisa que a página se atualiza; sem exercícios nem ações", async () => {
    detail = { batch: batchView({ id: BATCH_ID, status: "PENDING" }), exercises: [] };
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    expect(await screen.findByText(/A IA está gerando os exercícios/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Gerar de novo/ })).toBeNull();
  });

  it("010/US4-6 falhou: gerar de novo manda o mesmo pedido ligado a este lote e abre o novo", async () => {
    detail = { batch: batchView({ id: BATCH_ID, status: "FAILED", failureCode: "AI_OUTPUT_VALIDATION_FAILED", distribution: "MANUAL" }), exercises: [] };
    answer = () => json(202, batchView({ id: "00000000-0000-4000-d000-000000000002" }));
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const user = userEvent.setup();
    expect(await screen.findByText(/A geração falhou e nenhum exercício foi criado/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Gerar de novo" }));
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/exercicios/lotes/00000000-0000-4000-d000-000000000002"));
    expect(writes[0]).toMatchObject({
      method: "POST",
      url: "/api/exercise-batches",
      body: {
        syllabusRevisionId: POO_REVISION.id,
        syllabusItemId: topic.syllabusItemId,
        difficulty: "INTERMEDIATE",
        total: 5,
        types: ["OPEN_ANSWER", "MULTIPLE_CHOICE"],
        distribution: { mode: "MANUAL", counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 2 } },
        trickQuestions: 1,
        regeneratedFromId: BATCH_ID,
      },
    });
  });

  it("SC-012 a ordem de Tab segue as ações de cada rascunho", async () => {
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const user = userEvent.setup();
    const first = await card(1);
    await expectTabOrder(user, [
      screen.getByRole("button", { name: "Gerar de novo" }),
      within(first).getByLabelText("Selecionar exercício 1"),
      within(first).getByRole("button", { name: "Editar exercício 1" }),
      within(first).getByRole("button", { name: "Aprovar exercício 1" }),
      within(first).getByRole("button", { name: "Excluir exercício 1" }),
      screen.getByLabelText("Selecionar exercício 2"),
    ]);
  });
});

describe("014/US3 BatchReview — o rascunho de código da IA se edita com cores", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const writes: { method: string; url: string; body: unknown }[] = [];
  const code = exerciseView({
    ...ai,
    type: "CODE",
    statement: "Implemente a classe.",
    expectedAnswer: null,
    instructions: "Use herança.",
    starterCode: "class Animal {\n}",
    expectedSolution: "class Cao extends Animal {} // ok",
    language: { id: JAVA.id, name: JAVA.name, highlight: "java" },
  });

  beforeEach(() => {
    writes.length = 0;
    const detail: ExerciseBatchDetail = {
      batch: batchView({ id: BATCH_ID, status: "GENERATED", pendingReview: 1, total: 1 }),
      exercises: [code],
    };
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input, init) => {
      const method = init?.method ?? "GET";
      // 019: the editor reads the catalog for the language's execution phrase.
      if (method === "GET" && String(input) === "/api/programming-languages") return json(200, [JAVA]);
      if (method === "GET") return json(200, detail);
      writes.push({ method, url: String(input), body: JSON.parse(String(init!.body)) });
      return json(200, code);
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const edit = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(await screen.findByRole("button", { name: "Editar exercício 1" }));
    return { starter: await codeEditorByLabel(/^Código inicial/), solution: await codeEditorByLabel(/^Solução esperada/) };
  };

  it("014/US3-1 código inicial e solução esperada do rascunho no editor com a gramática da linguagem do exercício", async () => {
    const { container } = renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const { starter, solution } = await edit(userEvent.setup());
    expect(codeMirrorText(starter)).toBe("class Animal {\n}");
    await waitFor(() => expect(syntaxSegments(solution)).toEqual(expect.arrayContaining([["extends", "text-syntax-keyword"], ["// ok", "text-syntax-comment"]])));
    expect(syntaxSegments(starter)).toEqual(expect.arrayContaining([["class", "text-syntax-keyword"]]));
    await expectNoA11yViolations(container);
  });

  it("014/US3-3 solução apagada: erro ligado ao editor, sem envio", async () => {
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const user = userEvent.setup();
    const { solution } = await edit(user);
    solution.focus();
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    expect(codeMirrorText(solution)).toBe("");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    expect(await screen.findByText("Corrija os itens abaixo")).toBeTruthy();
    await waitFor(() => expectFieldErrorLinked(solution));
    await user.click(screen.getByRole("link", { name: "Informe a solução esperada." }));
    expect(document.activeElement).toBe(solution);
    expect(writes).toEqual([]);
  });

  it("014/US3-4 o corpo enviado traz o texto exato do código", async () => {
    renderWithProviders(<BatchReview batchId={BATCH_ID} />);
    const user = userEvent.setup();
    const { solution } = await edit(user);
    solution.focus();
    await user.keyboard("{Control>}{End}{/Control}");
    await typeCode(user, "\n");
    await user.keyboard("{Tab}");
    await typeCode(user, "/* fim */  ");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));
    await vi.waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]!.body).toMatchObject({
      starterCode: "class Animal {\n}",
      expectedSolution: "class Cao extends Animal {} // ok\n  /* fim */  ",
      version: 3,
    });
  });
});
