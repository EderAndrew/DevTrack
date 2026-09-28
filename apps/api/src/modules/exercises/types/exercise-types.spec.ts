import { ExerciseStudentViewSchema, ExerciseTeacherViewSchema, ExerciseTypeSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { checkExercise, exerciseContentRows } from "../rules/exercise-rules";
import { toStudentView } from "../views/student-view";
import { toTeacherView } from "../views/teacher-view";
import { EXERCISE_TYPES, type ExerciseRecord } from ".";

const LANGUAGE_ID = "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10";
const ITEM_ID = "9b2d7e41-0c3a-4f5e-8a6b-1c2d3e4f5a60";

/** Answer markers a student view must never carry (010/SC-006). */
const MARKERS = ["RESPOSTA-SECRETA-010", "EXPLICACAO-SECRETA-010", "SOLUCAO-SECRETA-010"];

const common = {
  statement: "Qual é a saída do programa?",
  explanation: "EXPLICACAO-SECRETA-010",
  difficulty: "INTERMEDIATE",
  cognitiveObjective: "ANALYZE",
  syllabusItemId: ITEM_ID,
} as const;

const INPUTS = {
  OPEN_ANSWER: { type: "OPEN_ANSWER", ...common, expectedAnswer: "RESPOSTA-SECRETA-010" },
  MULTIPLE_CHOICE: {
    type: "MULTIPLE_CHOICE",
    ...common,
    alternatives: [
      { text: "Distrator", isCorrect: false },
      { text: "Correta", isCorrect: true },
      { text: "Outro distrator", isCorrect: false },
    ],
    isTrickQuestion: true,
  },
  CODE: {
    type: "CODE",
    ...common,
    instructions: "Implemente a classe",
    starterCode: "class Animal {",
    expectedSolution: "SOLUCAO-SECRETA-010",
    languageId: LANGUAGE_ID,
  },
} as const;

/** The record the query layer would build for `input`, alternatives stored out of order. */
function record(type: keyof typeof INPUTS): ExerciseRecord {
  const rows = exerciseContentRows(checkExercise(INPUTS[type]).input!);
  return {
    id: "0d4e5f60-7a8b-4c9d-8e0f-112233445566",
    type,
    statement: rows.statement,
    explanation: rows.explanation,
    difficulty: "INTERMEDIATE",
    cognitiveObjective: "ANALYZE",
    origin: "MANUAL",
    status: "APPROVED",
    archivedFromStatus: null,
    version: 3,
    ...rows.columns,
    humanReviewed: false,
    humanEdited: false,
    reviewedAt: null,
    generationBatchId: null,
    createdAt: new Date("2026-09-28T10:00:00Z"),
    updatedAt: new Date("2026-09-28T11:00:00Z"),
    language: rows.columns.languageId ? { id: rows.columns.languageId, name: "Java" } : null,
    alternatives: rows.alternatives
      .map((alternative) => ({ id: `00000000-0000-4000-8000-00000000000${alternative.position}`, ...alternative }))
      .reverse(),
    reviewedBy: null,
    topic: null,
  };
}

describe("010/FR-001 registro de tipos", () => {
  it("cada tipo do contrato tem exatamente uma definição", () => {
    expect(Object.keys(EXERCISE_TYPES).sort()).toEqual([...ExerciseTypeSchema.options].sort());
    for (const [key, definition] of Object.entries(EXERCISE_TYPES)) expect(definition.type).toBe(key);
  });

  it("010/FR-003 pergunta e resposta grava só a resposta esperada", () => {
    const rows = exerciseContentRows(checkExercise(INPUTS.OPEN_ANSWER).input!);
    expect(rows.columns).toEqual({
      expectedAnswer: "RESPOSTA-SECRETA-010",
      instructions: null,
      starterCode: null,
      expectedSolution: null,
      languageId: null,
      isTrickQuestion: false,
    });
    expect(rows.alternatives).toEqual([]);
    expect(rows.statementSearchKey).toBe("qual e a saida do programa?");
  });

  it("010/FR-004 múltipla escolha grava as alternativas na ordem dada, com posição a partir de 0, e a pegadinha", () => {
    const rows = exerciseContentRows(checkExercise(INPUTS.MULTIPLE_CHOICE).input!);
    expect(rows.alternatives).toEqual([
      { position: 0, text: "Distrator", isCorrect: false },
      { position: 1, text: "Correta", isCorrect: true },
      { position: 2, text: "Outro distrator", isCorrect: false },
    ]);
    expect(rows.columns.isTrickQuestion).toBe(true);
    expect(rows.columns.expectedAnswer).toBeNull();
  });

  it("010/FR-005 código grava instruções, código inicial, solução e linguagem", () => {
    const rows = exerciseContentRows(checkExercise(INPUTS.CODE).input!);
    expect(rows.columns).toMatchObject({ instructions: "Implemente a classe", starterCode: "class Animal {", expectedSolution: "SOLUCAO-SECRETA-010", languageId: LANGUAGE_ID });
    const withoutStarter = exerciseContentRows(checkExercise({ ...INPUTS.CODE, starterCode: undefined }).input!);
    expect(withoutStarter.columns.starterCode).toBeNull();
  });
});

describe("010/FR-006 regras de estrutura (as mesmas para entrada manual, edição e resposta da IA)", () => {
  it("aceita as entradas válidas de cada tipo", () => {
    for (const input of Object.values(INPUTS)) expect(checkExercise(input).violations).toEqual([]);
  });

  it.each([
    ["2 alternativas", { ...INPUTS.MULTIPLE_CHOICE, alternatives: INPUTS.MULTIPLE_CHOICE.alternatives.slice(0, 2) }, "alternatives"],
    ["nenhuma correta", { ...INPUTS.MULTIPLE_CHOICE, alternatives: INPUTS.MULTIPLE_CHOICE.alternatives.map((a) => ({ ...a, isCorrect: false })) }, "alternatives"],
    ["texto repetido", { ...INPUTS.MULTIPLE_CHOICE, alternatives: [...INPUTS.MULTIPLE_CHOICE.alternatives.slice(0, 2), { text: "correta", isCorrect: false }] }, "alternatives"],
    ["código sem linguagem", { ...INPUTS.CODE, languageId: undefined }, "languageId"],
    ["pergunta sem resposta", { ...INPUTS.OPEN_ANSWER, expectedAnswer: "" }, "expectedAnswer"],
    ["tipo desconhecido", { ...INPUTS.OPEN_ANSWER, type: "ESSAY" }, "type"],
  ])("recusa %s, indicando o campo", (_, input, field) => {
    const result = checkExercise(input);
    expect(result.input).toBeNull();
    expect(result.violations.map((violation) => violation.field)).toContain(field);
  });

  it("as regras do tipo valem mesmo sem passar pelo contrato", () => {
    const tooMany = { ...INPUTS.MULTIPLE_CHOICE, alternatives: Array.from({ length: 6 }, (_, i) => ({ text: `A${i}`, isCorrect: i === 0 })) };
    expect(EXERCISE_TYPES.MULTIPLE_CHOICE.violations(tooMany)).toEqual([{ field: "alternatives", reason: "ALTERNATIVE_COUNT" }]);
    const twoCorrect = { ...INPUTS.MULTIPLE_CHOICE, alternatives: INPUTS.MULTIPLE_CHOICE.alternatives.map((a) => ({ ...a, isCorrect: true })) };
    expect(EXERCISE_TYPES.MULTIPLE_CHOICE.violations(twoCorrect)).toEqual([{ field: "alternatives", reason: "CORRECT_COUNT" }]);
  });
});

describe("010/FR-036 010/SC-006 visão do professor × visão do aluno", () => {
  it.each(ExerciseTypeSchema.options)("%s: a visão do professor segue o contrato e tem as respostas", (type) => {
    const view = toTeacherView(record(type));
    expect(ExerciseTeacherViewSchema.parse(view)).toEqual(view);
    expect(view.explanation).toBe("EXPLICACAO-SECRETA-010");
  });

  it.each(ExerciseTypeSchema.options)("%s: a visão do aluno segue o contrato estrito e não carrega resposta alguma", (type) => {
    const view = toStudentView(record(type));
    expect(ExerciseStudentViewSchema.parse(view)).toEqual(view);
    const serialized = JSON.stringify(view);
    for (const marker of MARKERS) expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain("isCorrect");
    expect(serialized).not.toContain("isTrickQuestion");
  });

  it("múltipla escolha: alternativas na ordem de apresentação nas duas visões, sem a correta para o aluno", () => {
    const teacher = toTeacherView(record("MULTIPLE_CHOICE"));
    expect(teacher.alternatives.map((a) => [a.position, a.text, a.isCorrect])).toEqual([
      [0, "Distrator", false],
      [1, "Correta", true],
      [2, "Outro distrator", false],
    ]);
    expect(teacher.isTrickQuestion).toBe(true);
    expect(toStudentView(record("MULTIPLE_CHOICE")).alternatives?.map((a) => Object.keys(a))).toEqual([["id", "text"], ["id", "text"], ["id", "text"]]);
  });

  it("código: o aluno vê instruções, código inicial e o nome da linguagem, nunca a solução", () => {
    expect(toStudentView(record("CODE"))).toEqual({
      id: "0d4e5f60-7a8b-4c9d-8e0f-112233445566",
      type: "CODE",
      statement: "Qual é a saída do programa?",
      difficulty: "INTERMEDIATE",
      instructions: "Implemente a classe",
      starterCode: "class Animal {",
      language: { name: "Java" },
    });
  });

  it("um campo novo no registro não chega ao aluno sem ser listado (lista de permitidos)", () => {
    const withExtra = { ...record("OPEN_ANSWER"), secretNote: "RESPOSTA-SECRETA-010" } as ExerciseRecord;
    expect(Object.keys(toStudentView(withExtra)).sort()).toEqual(["difficulty", "id", "statement", "type"]);
  });
});
