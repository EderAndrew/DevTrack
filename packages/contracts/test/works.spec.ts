import { describe, expect, it } from "vitest";
import {
  AiModelTierSchema,
  CreateWorkRequestSchema,
  distributeWorkQuestions,
  ExerciseDifficultySchema,
  GeneratedWorkSchema,
  UpdateWorkRequestSchema,
  WorkGenerationRequestSchema,
  WorkQuestionInputSchema,
  WorkStudentViewSchema,
  TestCaseVisibilitySchema,
  WorkDifficultySchema,
  WorkGenerationRequestStatusSchema,
  WorkGradingStrategySchema,
  WorkOriginSchema,
  WorkQuestionTypeSchema,
  WorkStatusSchema,
} from "../src/index.js";

describe("011 enums do banco de trabalhos", () => {
  it("têm exatamente os valores do data-model", () => {
    expect(WorkQuestionTypeSchema.options).toEqual(["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"]);
    expect(WorkGradingStrategySchema.options).toEqual(["EXACT_MATCH", "TEST_CASES", "AI_REVIEW"]);
    expect(WorkDifficultySchema.options).toEqual(["BASIC", "INTERMEDIATE", "ADVANCED"]);
    expect(WorkOriginSchema.options).toEqual(["MANUAL", "AI_GENERATED"]);
    expect(WorkStatusSchema.options).toEqual(["DRAFT", "APPROVED", "ARCHIVED"]);
    expect(TestCaseVisibilitySchema.options).toEqual(["PUBLIC", "PRIVATE"]);
    expect(WorkGenerationRequestStatusSchema.options).toEqual(["PENDING", "GENERATED", "FAILED", "CANCELLED"]);
  });

  it("011/FR-009 a dificuldade do trabalho é um enum próprio, sem reaproveitar o da 010 nem o tier de IA", () => {
    expect(WorkDifficultySchema).not.toBe(ExerciseDifficultySchema);
    expect(WorkDifficultySchema).not.toBe(AiModelTierSchema);
    expect(WorkDifficultySchema.safeParse("ADVANCED").success).toBe(true);
    for (const tier of AiModelTierSchema.options) {
      if (!WorkDifficultySchema.options.includes(tier as never)) expect(WorkDifficultySchema.safeParse(tier).success).toBe(false);
    }
  });
});

const ID = "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10";
const ITEM = (n: number) => `9b2d7e41-0c3a-4f5e-8a6b-1c2d3e4f5a${String(n).padStart(2, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

const alternatives = (count: number, correct: number[] = [0]) =>
  Array.from({ length: count }, (_, index) => ({ text: `Alternativa ${index + 1}`, isCorrect: correct.includes(index) }));
const openAnswer = { type: "OPEN_ANSWER", statement: "Explique herança.", expectedAnswer: "Reuso por especialização." };
const multipleChoice = (count = 3, correct: number[] = [0]) => ({ type: "MULTIPLE_CHOICE", statement: "Qual é a saída?", alternatives: alternatives(count, correct) });
const code = { type: "CODE", statement: "Some dois números.", expectedSolution: "a + b", languageId: ID };

const work = (overrides: Record<string, unknown> = {}) => ({
  subjectId: ID,
  title: "Trabalho de POO",
  totalGrade: "1.00",
  topics: null,
  questions: [openAnswer],
  status: "DRAFT",
  ...overrides,
});
const questions = (count: number) => Array.from({ length: count }, () => openAnswer);

describe("011/SC-003 fronteiras da criação manual", () => {
  it.each([
    [0, false],
    [1, true],
    [10, true],
    [11, false],
  ])("%i questões → aceita: %s", (count, ok) => {
    expect(accepts(CreateWorkRequestSchema, work({ questions: questions(count) }))).toBe(ok);
  });

  it.each([
    [2, false],
    [3, true],
    [5, true],
    [6, false],
  ])("Múltipla escolha com %i alternativas → aceita: %s", (count, ok) => {
    expect(accepts(WorkQuestionInputSchema, multipleChoice(count))).toBe(ok);
  });

  it.each([
    [[], false],
    [[1], true],
    [[0, 2], false],
  ])("Múltipla escolha com as corretas %j → aceita: %s", (correct, ok) => {
    expect(accepts(WorkQuestionInputSchema, multipleChoice(4, correct))).toBe(ok);
  });

  it("alternativas repetidas, ignorando acentos, maiúsculas e espaços, são recusadas", () => {
    const repeated = { ...multipleChoice(3), alternatives: [{ text: "Herança", isCorrect: true }, { text: " heranca ", isCorrect: false }, { text: "Outra", isCorrect: false }] };
    expect(accepts(WorkQuestionInputSchema, repeated)).toBe(false);
  });

  it("nota 0,05 para 10 questões é recusada; 0,10 para 10 é aceita", () => {
    expect(accepts(CreateWorkRequestSchema, work({ totalGrade: "0.05", questions: questions(10) }))).toBe(false);
    expect(accepts(CreateWorkRequestSchema, work({ totalGrade: "0.10", questions: questions(10) }))).toBe(true);
  });

  it("gabarito obrigatório por tipo; pegadinha só em múltipla escolha; até 20 casos de teste", () => {
    expect(accepts(WorkQuestionInputSchema, { ...openAnswer, expectedAnswer: undefined })).toBe(false);
    expect(accepts(WorkQuestionInputSchema, { ...code, expectedSolution: undefined })).toBe(false);
    expect(accepts(WorkQuestionInputSchema, { ...code, languageId: undefined })).toBe(false);
    expect(accepts(WorkQuestionInputSchema, { ...openAnswer, isTrickQuestion: true })).toBe(false);
    expect(accepts(WorkQuestionInputSchema, { ...multipleChoice(3), isTrickQuestion: true })).toBe(true);
    const testCase = { input: "", expectedOutput: "3", visibility: "PRIVATE" };
    expect(accepts(WorkQuestionInputSchema, { ...code, testCases: Array(20).fill(testCase) })).toBe(true);
    expect(accepts(WorkQuestionInputSchema, { ...code, testCases: Array(21).fill(testCase) })).toBe(false);
    expect(accepts(WorkQuestionInputSchema, { ...multipleChoice(3), testCases: [testCase] })).toBe(false);
  });

  it("tópicos: 1–10 distintos; os da questão (até 3) entre os do trabalho", () => {
    const topics = (count: number) => ({ syllabusRevisionId: ID, syllabusItemIds: Array.from({ length: count }, (_, i) => ITEM(i)) });
    expect(accepts(CreateWorkRequestSchema, work({ topics: topics(10) }))).toBe(true);
    expect(accepts(CreateWorkRequestSchema, work({ topics: topics(11) }))).toBe(false);
    expect(accepts(CreateWorkRequestSchema, work({ topics: topics(0) }))).toBe(false);
    expect(accepts(CreateWorkRequestSchema, work({ topics: { syllabusRevisionId: ID, syllabusItemIds: [ITEM(1), ITEM(1)] } }))).toBe(false);
    const withTopics = (ids: string[]) => work({ topics: topics(4), questions: [{ ...openAnswer, topicItemIds: ids }] });
    expect(accepts(CreateWorkRequestSchema, withTopics([ITEM(0), ITEM(1), ITEM(2)]))).toBe(true);
    expect(accepts(CreateWorkRequestSchema, withTopics([ITEM(0), ITEM(1), ITEM(2), ITEM(3)]))).toBe(false);
    expect(accepts(CreateWorkRequestSchema, withTopics([ITEM(9)]))).toBe(false);
    expect(accepts(CreateWorkRequestSchema, work({ questions: [{ ...openAnswer, topicItemIds: [ITEM(0)] }] }))).toBe(false);
  });

  it("a situação da criação é DRAFT ou APPROVED; a edição leva version e o id opcional", () => {
    expect(accepts(CreateWorkRequestSchema, work({ status: "APPROVED" }))).toBe(true);
    expect(accepts(CreateWorkRequestSchema, work({ status: "ARCHIVED" }))).toBe(false);
    const { subjectId: _subjectId, status: _status, ...edit } = work();
    expect(accepts(UpdateWorkRequestSchema, { ...edit, version: 1, questions: [{ ...openAnswer, id: ID }, openAnswer] })).toBe(true);
    expect(accepts(UpdateWorkRequestSchema, { ...edit, version: 1, questions: [{ ...openAnswer, id: ID }, { ...openAnswer, id: ID }] })).toBe(false);
    expect(accepts(UpdateWorkRequestSchema, { ...edit, subjectId: ID, version: 1 })).toBe(false);
    expect(accepts(CreateWorkRequestSchema, work({ questions: [{ ...openAnswer, id: ID }] }))).toBe(false);
  });
});

describe("011/FR-008 campos que o professor não controla são recusados", () => {
  it.each(["teacherId", "origin", "humanReviewed", "reviewedById", "model"])("%s no trabalho → recusado", (field) => {
    expect(accepts(CreateWorkRequestSchema, work({ [field]: field === "humanReviewed" ? true : ID }))).toBe(false);
  });

  it.each(["value", "gradingStrategy", "position"])("%s na questão → recusado", (field) => {
    expect(accepts(WorkQuestionInputSchema, { ...openAnswer, [field]: field === "position" ? 0 : "EXACT_MATCH" })).toBe(false);
  });

  it("a visão do aluno é estrita: nenhum campo de gabarito cabe nela", () => {
    const view = { id: ID, title: "T", description: null, totalGrade: "1.00", questions: [{ id: ID, position: 0, type: "MULTIPLE_CHOICE", value: "1.00", statement: "S", alternatives: [{ id: ID, text: "A" }] }] };
    expect(accepts(WorkStudentViewSchema, view)).toBe(true);
    const question = view.questions[0]!;
    for (const leak of [
      { alternatives: [{ id: ID, text: "A", isCorrect: true }] },
      { expectedAnswer: "x" },
      { expectedSolution: "x" },
      { explanation: "x" },
      { rubric: "x" },
      { gradingStrategy: "EXACT_MATCH" },
      { publicTestCases: [{ input: "", expectedOutput: "", visibility: "PRIVATE" }] },
    ]) {
      expect(accepts(WorkStudentViewSchema, { ...view, questions: [{ ...question, ...leak }] }), JSON.stringify(leak)).toBe(false);
    }
    expect(accepts(WorkStudentViewSchema, { ...view, origin: "MANUAL" })).toBe(false);
  });
});

const generation = (overrides: Record<string, unknown> = {}) => ({
  subjectId: ID,
  syllabusRevisionId: ID,
  syllabusItemIds: [ITEM(0), ITEM(1), ITEM(2)],
  title: "Trabalho gerado",
  difficulty: "INTERMEDIATE",
  totalGrade: "10.00",
  total: 10,
  types: ["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"],
  distribution: { mode: "AUTO" },
  trickQuestions: 2,
  idempotencyKey: ID,
  ...overrides,
});

describe("011 pedido de geração com IA (011/FR-018–FR-022)", () => {
  it("011/US3-2 pedido sem dificuldade ou sem nenhum tópico é recusado", () => {
    expect(accepts(WorkGenerationRequestSchema, generation())).toBe(true);
    const { difficulty: _difficulty, ...withoutDifficulty } = generation();
    expect(accepts(WorkGenerationRequestSchema, withoutDifficulty)).toBe(false);
    expect(accepts(WorkGenerationRequestSchema, generation({ syllabusItemIds: [] }))).toBe(false);
  });

  it.each(["model", "provider", "tier", "family", "task", "instructions", "language", "topicText"])(
    "011/US3-4 o campo %s é recusado",
    (field) => {
      expect(accepts(WorkGenerationRequestSchema, generation({ [field]: "qualquer" }))).toBe(false);
    },
  );

  it("011/US3-5 distribuição automática de 10 questões em 3 tipos → 4, 3 e 3", () => {
    expect(distributeWorkQuestions(10, ["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"])).toEqual({ OPEN_ANSWER: 4, MULTIPLE_CHOICE: 3, CODE: 3 });
    expect(distributeWorkQuestions(10, ["CODE", "OPEN_ANSWER", "MULTIPLE_CHOICE"])).toEqual({ OPEN_ANSWER: 4, MULTIPLE_CHOICE: 3, CODE: 3 });
    expect(distributeWorkQuestions(5, ["MULTIPLE_CHOICE", "CODE"])).toEqual({ OPEN_ANSWER: 0, MULTIPLE_CHOICE: 3, CODE: 2 });
    expect(accepts(WorkGenerationRequestSchema, generation({ total: 2 }))).toBe(false);
  });

  it("011/US3-6 6 múltipla escolha e 3 pegadinhas é aceito; 2 com 3, 4 pegadinhas e pegadinha sem múltipla escolha são recusados", () => {
    const manual = (counts: Record<string, number>, trickQuestions: number) =>
      generation({ total: Object.values(counts).reduce((a, b) => a + b, 0), types: Object.keys(counts), distribution: { mode: "MANUAL", counts }, trickQuestions });
    expect(accepts(WorkGenerationRequestSchema, manual({ MULTIPLE_CHOICE: 6 }, 3))).toBe(true);
    expect(accepts(WorkGenerationRequestSchema, manual({ MULTIPLE_CHOICE: 2, OPEN_ANSWER: 1 }, 3))).toBe(false);
    expect(accepts(WorkGenerationRequestSchema, manual({ MULTIPLE_CHOICE: 6 }, 4))).toBe(false);
    expect(accepts(WorkGenerationRequestSchema, manual({ OPEN_ANSWER: 3 }, 1))).toBe(false);
  });

  it("011/FR-019 a distribuição manual soma o total, com cada tipo escolhido ≥ 1", () => {
    const manual = (counts: Record<string, number>, total: number, types = Object.keys(counts)) =>
      generation({ total, types, distribution: { mode: "MANUAL", counts }, trickQuestions: 0 });
    expect(accepts(WorkGenerationRequestSchema, manual({ OPEN_ANSWER: 2, CODE: 1 }, 3))).toBe(true);
    expect(accepts(WorkGenerationRequestSchema, manual({ OPEN_ANSWER: 2, CODE: 1 }, 4))).toBe(false);
    expect(accepts(WorkGenerationRequestSchema, manual({ OPEN_ANSWER: 3, CODE: 0 }, 3))).toBe(false);
    expect(accepts(WorkGenerationRequestSchema, manual({ OPEN_ANSWER: 3 }, 3, ["OPEN_ANSWER", "CODE"]))).toBe(false);
    expect(accepts(WorkGenerationRequestSchema, generation({ types: ["CODE", "CODE"], trickQuestions: 0 }))).toBe(false);
  });

  it("011/FR-021 7 tópicos e 2 questões é recusado; 6 e 2 é aceito", () => {
    const items = (count: number) => Array.from({ length: count }, (_, i) => ITEM(i));
    const small = { total: 2, types: ["OPEN_ANSWER"], trickQuestions: 0 };
    expect(accepts(WorkGenerationRequestSchema, generation({ ...small, syllabusItemIds: items(7) }))).toBe(false);
    expect(accepts(WorkGenerationRequestSchema, generation({ ...small, syllabusItemIds: items(6) }))).toBe(true);
    expect(accepts(WorkGenerationRequestSchema, generation({ syllabusItemIds: items(11) }))).toBe(false);
    expect(accepts(WorkGenerationRequestSchema, generation({ syllabusItemIds: [ITEM(0), ITEM(0)] }))).toBe(false);
  });

  it("011/FR-018 a nota do pedido segue as mesmas regras: ≥ 0,01 por questão", () => {
    expect(accepts(WorkGenerationRequestSchema, generation({ totalGrade: "0.10" }))).toBe(true);
    expect(accepts(WorkGenerationRequestSchema, generation({ totalGrade: "0.09" }))).toBe(false);
    expect(accepts(WorkGenerationRequestSchema, generation({ totalGrade: "0,50" }))).toBe(false);
  });

  it("011/FR-028 a saída da IA é estrita e não tem título, nota, valores, ids nem situação", () => {
    const question = { type: "OPEN_ANSWER", statement: "S", explanation: "E", topicRefs: ["T1"], difficulty: "BASIC", expectedAnswer: "R", rubric: null };
    expect(accepts(GeneratedWorkSchema, { questions: [question] })).toBe(true);
    for (const extra of [{ title: "x" }, { totalGrade: "1.00" }, { status: "APPROVED" }, { topics: [] }]) {
      expect(accepts(GeneratedWorkSchema, { questions: [question], ...extra })).toBe(false);
    }
    for (const extra of [{ value: "1.00" }, { id: ID }, { syllabusItemIds: [ID] }]) {
      expect(accepts(GeneratedWorkSchema, { questions: [{ ...question, ...extra }] })).toBe(false);
    }
  });
});
