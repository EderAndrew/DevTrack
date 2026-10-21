import { describe, expect, it } from "vitest";
import {
  AiModelTierSchema,
  CodeHighlightSchema,
  CognitiveObjectiveSchema,
  CreateExerciseRequestSchema,
  distributeExercises,
  ExerciseBatchRequestSchema,
  ExerciseBatchStatusSchema,
  ExerciseDifficultySchema,
  ExerciseInputSchema,
  ExerciseListQuerySchema,
  ExerciseOriginSchema,
  ExerciseSetRequestSchema,
  ExerciseStatusSchema,
  ExerciseStudentViewSchema,
  ExerciseTestCaseSchema,
  ExerciseTypeSchema,
  ProgrammingLanguageViewSchema,
  UpdateExerciseRequestSchema,
} from "../src/index.js";

const ID = "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10";
const OTHER_ID = "9b2d7e41-0c3a-4f5e-8a6b-1c2d3e4f5a60";

const common = { statement: "Qual é a saída?", explanation: "Porque sim.", difficulty: "BASIC", cognitiveObjective: "APPLY" };
const alternatives = (count: number, correct: number[] = [0]) =>
  Array.from({ length: count }, (_, index) => ({ text: `Alternativa ${index + 1}`, isCorrect: correct.includes(index) }));
const multipleChoice = (count = 3, correct: number[] = [0]) => ({ type: "MULTIPLE_CHOICE", ...common, alternatives: alternatives(count, correct) });
const openAnswer = { type: "OPEN_ANSWER", ...common, expectedAnswer: "Resposta" };
const code = { type: "CODE", ...common, instructions: "Implemente", expectedSolution: "class A {}", languageId: ID };
const set = (count: number) => ({ exercises: Array.from({ length: count }, () => openAnswer), status: "DRAFT" });

const batch = (overrides: Record<string, unknown> = {}) => ({
  syllabusRevisionId: ID,
  syllabusItemId: OTHER_ID,
  difficulty: "INTERMEDIATE",
  total: 5,
  types: ["MULTIPLE_CHOICE"],
  distribution: { mode: "AUTO" },
  trickQuestions: 0,
  idempotencyKey: ID,
  ...overrides,
});
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

describe("010 contratos do banco de exercícios", () => {
  it("010/FR-001 010/FR-008 010/FR-009 010/FR-010 vocabulário da plataforma: tipos, objetivos, origem e situações", () => {
    expect(ExerciseTypeSchema.options).toEqual(["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"]);
    expect(CognitiveObjectiveSchema.options).toEqual(["RECOGNIZE", "UNDERSTAND", "APPLY", "ANALYZE", "CREATE"]);
    expect(ExerciseOriginSchema.options).toEqual(["MANUAL", "AI_GENERATED"]);
    expect(ExerciseStatusSchema.options).toEqual(["DRAFT", "APPROVED", "ARCHIVED"]);
    expect(ExerciseBatchStatusSchema.options).toEqual(["PENDING", "GENERATED", "FAILED", "CANCELLED"]);
  });

  it("010/FR-007 a dificuldade pedagógica é um tipo próprio, sem equivalência com o nível de capacidade de IA", () => {
    expect(ExerciseDifficultySchema.options).toEqual(["BASIC", "INTERMEDIATE", "ADVANCED"]);
    // Different sets on purpose: INTERMEDIATE is not a model tier and STANDARD is not a difficulty.
    expect(ExerciseDifficultySchema.safeParse("STANDARD").success).toBe(false);
    expect(AiModelTierSchema.safeParse("INTERMEDIATE").success).toBe(false);
    expect(ExerciseDifficultySchema).not.toBe(AiModelTierSchema);
  });
});

describe("010/SC-003 010/FR-004 010/FR-016 fronteiras da criação manual", () => {
  it.each([
    [2, false],
    [3, true],
    [5, true],
    [6, false],
  ])("Múltipla escolha com %i alternativas → aceita: %s", (count, ok) => {
    expect(accepts(ExerciseInputSchema, multipleChoice(count))).toBe(ok);
  });

  it.each([
    [[], false],
    [[1], true],
    [[0, 2], false],
  ])("Múltipla escolha com as corretas %j → aceita: %s", (correct, ok) => {
    expect(accepts(ExerciseInputSchema, multipleChoice(4, correct))).toBe(ok);
  });

  it("alternativas repetidas, ignorando acentos, maiúsculas e espaços, são recusadas", () => {
    const repeated = { ...multipleChoice(3), alternatives: [{ text: "Herança", isCorrect: true }, { text: "  heranca ", isCorrect: false }, { text: "Polimorfismo", isCorrect: false }] };
    const result = ExerciseInputSchema.safeParse(repeated);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(["alternatives"]);
  });

  it.each([
    [2, false],
    [3, true],
    [10, true],
    [11, false],
  ])("conjunto com %i exercícios → aceito: %s", (count, ok) => {
    expect(accepts(ExerciseSetRequestSchema, set(count))).toBe(ok);
  });

  it("um exercício inválido recusa o conjunto e o erro aponta o exercício", () => {
    const result = ExerciseSetRequestSchema.safeParse({ exercises: [openAnswer, multipleChoice(2), code], status: "APPROVED" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path.slice(0, 2)).toEqual(["exercises", 1]);
  });

  it("010/FR-003 010/FR-005 campos obrigatórios de cada tipo; o código inicial é opcional; pegadinha padrão não", () => {
    expect(accepts(ExerciseInputSchema, { ...openAnswer, expectedAnswer: "   " })).toBe(false);
    expect(accepts(ExerciseInputSchema, { ...code, languageId: undefined })).toBe(false);
    expect(accepts(ExerciseInputSchema, { ...code, expectedSolution: undefined })).toBe(false);
    expect(accepts(ExerciseInputSchema, { ...code, starterCode: "class A {" })).toBe(true);
    expect(accepts(ExerciseInputSchema, { ...common })).toBe(false);
    const parsed = ExerciseInputSchema.parse(multipleChoice(3));
    expect(parsed.type === "MULTIPLE_CHOICE" && parsed.isTrickQuestion).toBe(false);
    // Fields of another type are unknown fields.
    expect(accepts(ExerciseInputSchema, { ...openAnswer, languageId: ID })).toBe(false);
    expect(accepts(ExerciseInputSchema, { ...openAnswer, isTrickQuestion: true })).toBe(false);
  });

  it("010/FR-009 010/FR-012 campos controlados pelo servidor são recusados", () => {
    for (const field of ["teacherId", "origin", "humanReviewed", "reviewedById", "model", "tier"]) {
      expect(accepts(CreateExerciseRequestSchema, { ...openAnswer, status: "DRAFT", [field]: "x" }), field).toBe(false);
    }
    expect(accepts(CreateExerciseRequestSchema, { ...openAnswer, status: "DRAFT" })).toBe(true);
    expect(accepts(CreateExerciseRequestSchema, { ...openAnswer, status: "ARCHIVED" })).toBe(false);
    expect(accepts(CreateExerciseRequestSchema, multipleChoice(2))).toBe(false);
  });

  it("filtros da lista: página até 50 e busca até 200 caracteres", () => {
    expect(ExerciseListQuerySchema.parse({ pageSize: "50" }).pageSize).toBe(50);
    expect(accepts(ExerciseListQuerySchema, { pageSize: "51" })).toBe(false);
    expect(accepts(ExerciseListQuerySchema, { query: "a".repeat(201) })).toBe(false);
    expect(accepts(ExerciseListQuerySchema, { teacherId: ID })).toBe(false);
  });

  it("linguagens do catálogo: id, chave, nome, gramática (014) e perfil de execução (019/FR-020)", () => {
    expect(accepts(ProgrammingLanguageViewSchema, { id: ID, key: "java", name: "Java", highlight: "java", execution: "java" })).toBe(true);
    expect(accepts(ProgrammingLanguageViewSchema, { id: ID, key: "java", name: "Java", highlight: null, execution: null })).toBe(true);
    expect(accepts(ProgrammingLanguageViewSchema, { id: ID, key: "java", name: "Java", highlight: null })).toBe(false);
    expect(accepts(ProgrammingLanguageViewSchema, { id: ID, key: "java", name: "Java", execution: null })).toBe(false);
    expect(accepts(ProgrammingLanguageViewSchema, { id: ID, key: "c", name: "C", highlight: null, execution: "c" })).toBe(false);
    expect(
      accepts(ProgrammingLanguageViewSchema, { id: ID, key: "java", name: "Java", highlight: null, execution: null, aliases: [] }),
    ).toBe(false);
  });

  it("014/FR-002 a chave de gramática é minúscula, sem espaço, até 32 caracteres", () => {
    for (const ok of ["java", "cpp", "html", "type-script2", "a"]) expect(accepts(CodeHighlightSchema, ok)).toBe(true);
    for (const bad of ["Java", "java script", "2java", "-java", "", "a".repeat(33)]) {
      expect(accepts(CodeHighlightSchema, bad)).toBe(false);
    }
    expect(accepts(CodeHighlightSchema, null)).toBe(true);
  });
});

describe("010/FR-036 visão do aluno: lista fechada, sem respostas", () => {
  const student = { id: ID, type: "MULTIPLE_CHOICE", statement: "Qual?", difficulty: "BASIC", alternatives: [{ id: OTHER_ID, text: "A" }] };

  it("aceita só os campos permitidos", () => {
    expect(accepts(ExerciseStudentViewSchema, student)).toBe(true);
  });

  it.each(["explanation", "expectedAnswer", "expectedSolution", "origin", "humanReviewed", "isTrickQuestion", "cognitiveObjective"])(
    "recusa %s",
    (field) => {
      expect(accepts(ExerciseStudentViewSchema, { ...student, [field]: "x" })).toBe(false);
    },
  );

  it("recusa a indicação da alternativa correta", () => {
    expect(accepts(ExerciseStudentViewSchema, { ...student, alternatives: [{ id: OTHER_ID, text: "A", isCorrect: true }] })).toBe(false);
  });
});

describe("010/FR-019 010/FR-020 pedido de geração e distribuição automática", () => {
  it("10 em três tipos → 4/3/3; 5 em dois → 3/2; determinística e na ordem fixa dos tipos", () => {
    expect(distributeExercises(10, ["CODE", "MULTIPLE_CHOICE", "OPEN_ANSWER"])).toEqual({ OPEN_ANSWER: 4, MULTIPLE_CHOICE: 3, CODE: 3 });
    expect(distributeExercises(5, ["CODE", "OPEN_ANSWER"])).toEqual({ OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 2 });
    expect(distributeExercises(5, ["OPEN_ANSWER", "CODE"])).toEqual(distributeExercises(5, ["CODE", "OPEN_ANSWER"]));
    for (let total = 3; total <= 10; total += 1) {
      const counts = Object.values(distributeExercises(total, ["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"]));
      expect(counts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
    }
  });

  it("pegadinhas: 5 MC + 3 aceito; 2 MC + 3 e 4 pegadinhas recusados; pegadinha sem MC recusada", () => {
    expect(accepts(ExerciseBatchRequestSchema, batch({ trickQuestions: 3 }))).toBe(true);
    const twoMc = { types: ["OPEN_ANSWER", "MULTIPLE_CHOICE"], distribution: { mode: "MANUAL", counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 2 } } };
    expect(accepts(ExerciseBatchRequestSchema, batch({ ...twoMc, trickQuestions: 2 }))).toBe(true);
    expect(accepts(ExerciseBatchRequestSchema, batch({ ...twoMc, trickQuestions: 3 }))).toBe(false);
    expect(accepts(ExerciseBatchRequestSchema, batch({ total: 10, trickQuestions: 4 }))).toBe(false);
    expect(accepts(ExerciseBatchRequestSchema, batch({ types: ["OPEN_ANSWER"], trickQuestions: 1 }))).toBe(false);
  });

  it("distribuição manual: um número por tipo escolhido, cada um ≥ 1, somando o total", () => {
    const manual = (counts: Record<string, number>) => batch({ types: ["OPEN_ANSWER", "CODE"], distribution: { mode: "MANUAL", counts } });
    expect(accepts(ExerciseBatchRequestSchema, manual({ OPEN_ANSWER: 4, CODE: 1 }))).toBe(true);
    expect(accepts(ExerciseBatchRequestSchema, manual({ OPEN_ANSWER: 4, CODE: 2 }))).toBe(false);
    expect(accepts(ExerciseBatchRequestSchema, manual({ OPEN_ANSWER: 5, CODE: 0 }))).toBe(false);
    expect(accepts(ExerciseBatchRequestSchema, manual({ OPEN_ANSWER: 5 }))).toBe(false);
    expect(accepts(ExerciseBatchRequestSchema, manual({ OPEN_ANSWER: 3, CODE: 1, MULTIPLE_CHOICE: 1 }))).toBe(false);
  });

  it("total de 3 a 10, tipos distintos e sem linguagem ou tópico em texto livre", () => {
    expect(accepts(ExerciseBatchRequestSchema, batch({ total: 2 }))).toBe(false);
    expect(accepts(ExerciseBatchRequestSchema, batch({ total: 11 }))).toBe(false);
    expect(accepts(ExerciseBatchRequestSchema, batch({ total: 10 }))).toBe(true);
    expect(accepts(ExerciseBatchRequestSchema, batch({ types: ["CODE", "CODE"] }))).toBe(false);
    expect(accepts(ExerciseBatchRequestSchema, batch({ types: [] }))).toBe(false);
    for (const field of ["language", "languageId", "topic", "model", "tier", "teacherId"]) {
      expect(accepts(ExerciseBatchRequestSchema, batch({ [field]: "x" })), field).toBe(false);
    }
  });
});

describe("019 casos de teste no banco de exercícios (contracts/http-api.md, research B16)", () => {
  const testCase = (n: number, visibility = "PUBLIC") => ({ input: `${n}\n`, expectedOutput: `${n * 2}\n`, visibility });
  const cases = (count: number) => Array.from({ length: count }, (_, n) => testCase(n, n % 2 ? "PRIVATE" : "PUBLIC"));

  it("019/FR-001 019/FR-003 criar, editar e sets aceitam de 0 a 20 casos; 21 recusa o corpo", () => {
    for (const count of [0, 1, 20]) {
      expect(accepts(ExerciseInputSchema, { ...code, testCases: cases(count) }), String(count)).toBe(true);
      expect(accepts(CreateExerciseRequestSchema, { ...code, status: "DRAFT", testCases: cases(count) }), String(count)).toBe(true);
      expect(accepts(UpdateExerciseRequestSchema, { ...code, version: 1, testCases: cases(count) }), String(count)).toBe(true);
    }
    expect(accepts(ExerciseInputSchema, code)).toBe(true);
    expect(accepts(ExerciseInputSchema, { ...code, testCases: cases(21) })).toBe(false);
    expect(accepts(ExerciseSetRequestSchema, { exercises: [code, { ...code, testCases: cases(3) }, openAnswer], status: "APPROVED" })).toBe(true);
  });

  it("019/FR-001 entrada vazia e saída esperada vazia passam pelo contrato (a saída vazia é uma regra do servidor, 422)", () => {
    expect(accepts(ExerciseInputSchema, { ...code, testCases: [{ input: "", expectedOutput: "42", visibility: "PUBLIC" }] })).toBe(true);
    expect(accepts(ExerciseInputSchema, { ...code, testCases: [{ input: "1", expectedOutput: "", visibility: "PRIVATE" }] })).toBe(true);
    expect(accepts(ExerciseInputSchema, { ...code, testCases: [{ input: "x".repeat(10_000), expectedOutput: "y".repeat(10_000), visibility: "PUBLIC" }] })).toBe(true);
    expect(accepts(ExerciseInputSchema, { ...code, testCases: [{ input: "x".repeat(10_001), expectedOutput: "1", visibility: "PUBLIC" }] })).toBe(false);
    expect(accepts(ExerciseInputSchema, { ...code, testCases: [{ input: "1", expectedOutput: "y".repeat(10_001), visibility: "PUBLIC" }] })).toBe(false);
  });

  it("019/FR-001 cada caso é estrito: visibilidade PUBLIC ou PRIVATE, sem id, posição nem campos extras", () => {
    for (const extra of [{ id: ID }, { position: 0 }, { weight: 1 }, { hidden: true }]) {
      expect(accepts(ExerciseInputSchema, { ...code, testCases: [{ ...testCase(1), ...extra }] }), JSON.stringify(extra)).toBe(false);
    }
    expect(accepts(ExerciseInputSchema, { ...code, testCases: [testCase(1, "SECRET")] })).toBe(false);
    expect(accepts(ExerciseInputSchema, { ...code, testCases: [{ input: "1", visibility: "PUBLIC" }] })).toBe(false);
  });

  it("019/FR-001 casos em outro tipo passam pelo contrato para o servidor nomear a regra (422 TEST_CASES_NOT_ALLOWED)", () => {
    expect(accepts(ExerciseInputSchema, { ...openAnswer, testCases: cases(1) })).toBe(true);
    expect(accepts(ExerciseInputSchema, { ...multipleChoice(), testCases: cases(1) })).toBe(true);
  });

  it("019/FR-001 a visão do professor traz os casos com posição; a do aluno do banco não tem casos", () => {
    expect(accepts(ExerciseTestCaseSchema, { position: 0, ...testCase(1) })).toBe(true);
    expect(accepts(ExerciseTestCaseSchema, { position: 20, ...testCase(1) })).toBe(false);
    expect(accepts(ExerciseTestCaseSchema, { ...testCase(1) })).toBe(false);
    expect(accepts(ExerciseStudentViewSchema, { id: ID, type: "CODE", statement: "x", difficulty: "BASIC", testCases: [] })).toBe(false);
  });
});
