import { WorkQuestionTypeSchema, WorkStudentViewSchema, WorkTeacherViewSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { checkWorkQuestion, workQuestionContentRows } from "../rules/work-rules";
import { toWorkStudentView } from "../views/student-view";
import { toWorkTeacherView } from "../views/teacher-view";
import { gradingStrategyOf, WORK_QUESTION_TYPES, type WorkQuestionRecord, type WorkRecord } from ".";

const LANGUAGE_ID = "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10";
const ITEM_ID = "9b2d7e41-0c3a-4f5e-8a6b-1c2d3e4f5a60";
const uuid = (n: number) => `0d4e5f60-7a8b-4c9d-8e0f-1122334455${String(n).padStart(2, "0")}`;

/** Answer markers a student view must never carry (011/SC-007). */
const MARKERS = [
  "RESPOSTA-SECRETA-011",
  "RUBRICA-SECRETA-011",
  "EXPLICACAO-SECRETA-011",
  "SOLUCAO-SECRETA-011",
  "SAIDA-PRIVADA-011",
  "ENTRADA-PRIVADA-011",
];

const common = { statement: "Qual é a saída do programa?", explanation: "EXPLICACAO-SECRETA-011", topicItemIds: [ITEM_ID] } as const;

const INPUTS = {
  OPEN_ANSWER: { type: "OPEN_ANSWER", ...common, expectedAnswer: "RESPOSTA-SECRETA-011", rubric: "RUBRICA-SECRETA-011" },
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
    expectedSolution: "SOLUCAO-SECRETA-011",
    languageId: LANGUAGE_ID,
    testCases: [
      { input: "1 2", expectedOutput: "3", visibility: "PUBLIC" },
      { input: "ENTRADA-PRIVADA-011", expectedOutput: "SAIDA-PRIVADA-011", visibility: "PRIVATE" },
    ],
  },
} as const;

type TypeKey = keyof typeof INPUTS;

/** The record the query layer would build for `input`, alternatives and test cases stored out of order. */
function questionRecord(type: TypeKey, position = 0): WorkQuestionRecord {
  const rows = workQuestionContentRows(checkWorkQuestion(INPUTS[type]).input!);
  return {
    id: uuid(position),
    position,
    type,
    gradingStrategy: rows.gradingStrategy,
    statement: rows.statement,
    explanation: rows.explanation,
    valueCents: 17,
    expectedAnswer: rows.columns.expectedAnswer,
    rubric: rows.columns.rubric,
    instructions: rows.columns.instructions,
    starterCode: rows.columns.starterCode,
    expectedSolution: rows.columns.expectedSolution,
    language: rows.columns.languageId ? { id: rows.columns.languageId, name: "Java", highlight: "java" } : null,
    isTrickQuestion: rows.columns.isTrickQuestion,
    alternatives: rows.alternatives.map((row, index) => ({ id: uuid(20 + index), ...row })).reverse(),
    testCases: rows.testCases.map((row, index) => ({ id: uuid(40 + index), ...row })).reverse(),
    topicItemIds: [ITEM_ID],
  };
}

function workRecord(questions: WorkQuestionRecord[]): WorkRecord {
  return {
    id: uuid(99),
    subject: { id: uuid(98), name: "POO" },
    syllabusRevisionId: uuid(97),
    topics: [{ syllabusItemId: ITEM_ID, itemText: "Herança", groupTitle: "Orientação a objetos" }],
    title: "Trabalho de POO",
    description: null,
    difficulty: "INTERMEDIATE",
    totalGradeCents: 50,
    questionCount: questions.length,
    origin: "MANUAL",
    status: "APPROVED",
    archivedFromStatus: null,
    version: 2,
    humanReviewed: false,
    humanEdited: false,
    reviewedBy: null,
    reviewedAt: null,
    generationRequestId: null,
    questions,
    createdAt: new Date("2026-09-30T12:00:00Z"),
    updatedAt: new Date("2026-09-30T12:00:00Z"),
  };
}

const ALL = (): WorkQuestionRecord[] => [questionRecord("CODE", 2), questionRecord("OPEN_ANSWER", 0), questionRecord("MULTIPLE_CHOICE", 1)];

describe("011 registro de tipos de questão (research W5)", () => {
  it("011/FR-004 cobre exatamente os tipos do contrato", () => {
    expect(Object.keys(WORK_QUESTION_TYPES).sort()).toEqual([...WorkQuestionTypeSchema.options].sort());
  });

  it("011/FR-036 a estratégia de correção é fixada pelo tipo", () => {
    expect(gradingStrategyOf("MULTIPLE_CHOICE")).toBe("EXACT_MATCH");
    expect(gradingStrategyOf("CODE")).toBe("TEST_CASES");
    expect(gradingStrategyOf("OPEN_ANSWER")).toBe("AI_REVIEW");
    for (const type of WorkQuestionTypeSchema.options) expect(questionRecord(type).gradingStrategy).toBe(gradingStrategyOf(type));
  });

  it.each(Object.keys(INPUTS) as TypeKey[])("011/FR-015 %s: gabarito completo; sem ele, incompleto", (type) => {
    const definition = WORK_QUESTION_TYPES[type];
    const complete = questionRecord(type);
    expect(definition.answerKeyComplete(complete)).toBe(true);
    const broken = { ...complete, expectedAnswer: null, expectedSolution: "  ", alternatives: complete.alternatives.map((a) => ({ ...a, isCorrect: false })) };
    expect(definition.answerKeyComplete(broken)).toBe(false);
  });

  it("mapeia as linhas de cada tipo, nulas para os campos dos outros tipos", () => {
    const open = workQuestionContentRows(checkWorkQuestion(INPUTS.OPEN_ANSWER).input!);
    expect(open.columns).toMatchObject({ expectedAnswer: "RESPOSTA-SECRETA-011", rubric: "RUBRICA-SECRETA-011", languageId: null, isTrickQuestion: false });
    expect(open.alternatives).toEqual([]);
    expect(open.testCases).toEqual([]);
    const choice = workQuestionContentRows(checkWorkQuestion(INPUTS.MULTIPLE_CHOICE).input!);
    expect(choice.alternatives.map((row) => row.position)).toEqual([0, 1, 2]);
    expect(choice.columns).toMatchObject({ isTrickQuestion: true, expectedAnswer: null });
    const code = workQuestionContentRows(checkWorkQuestion(INPUTS.CODE).input!);
    expect(code.testCases.map((row) => [row.position, row.visibility])).toEqual([
      [0, "PUBLIC"],
      [1, "PRIVATE"],
    ]);
    expect(code.columns).toMatchObject({ languageId: LANGUAGE_ID, expectedSolution: "SOLUCAO-SECRETA-011", isTrickQuestion: false });
  });
});

describe("011 visões do professor e do aluno (research W14)", () => {
  it("a visão do professor segue o contrato, em ordem de posição, com valores em duas casas", () => {
    const view = toWorkTeacherView(workRecord(ALL()));
    expect(WorkTeacherViewSchema.parse(view)).toEqual(view);
    // Positions 0, 1, 2 were built as open answer, multiple choice and code: the contract's order.
    expect(view.questions.map((q) => q.type)).toEqual(WorkQuestionTypeSchema.options);
    expect(view.questions.every((q) => q.value === "0.17")).toBe(true);
    expect(view.totalGrade).toBe("0.50");
    expect(view.questions[1]!.alternatives!.map((a) => a.position)).toEqual([0, 1, 2]);
    expect(view.questions[2]!.testCases!.map((c) => c.input)).toEqual(["1 2", "ENTRADA-PRIVADA-011"]);
    expect(view.warnings).toEqual([]);
  });

  it.each(Object.keys(INPUTS) as TypeKey[])("011/SC-007 a visão do aluno de %s segue o contrato estrito e não tem marcador de gabarito", (type) => {
    const view = toWorkStudentView(workRecord([questionRecord(type)]));
    expect(WorkStudentViewSchema.parse(view)).toEqual(view);
    const serialized = JSON.stringify(view);
    for (const marker of MARKERS) expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain("isCorrect");
    expect(serialized).not.toContain("gradingStrategy");
  });

  it("a visão do aluno mostra só os casos de teste públicos e as alternativas na ordem de apresentação", () => {
    const [code, choice] = [questionRecord("CODE", 0), questionRecord("MULTIPLE_CHOICE", 1)];
    const view = toWorkStudentView(workRecord([code, choice]));
    expect(view.questions[0]!.publicTestCases).toEqual([{ input: "1 2", expectedOutput: "3" }]);
    expect(view.questions[0]).toMatchObject({ instructions: "Implemente a classe", starterCode: "class Animal {", language: { name: "Java", highlight: "java" } });
    expect(view.questions[1]!.alternatives!.map((a) => a.text)).toEqual(["Distrator", "Correta", "Outro distrator"]);
  });

  it("uma coluna nova na linha não aparece na visão do aluno (lista fechada)", () => {
    const leaky = { ...questionRecord("OPEN_ANSWER"), secretColumn: "COLUNA-NOVA-011" } as WorkQuestionRecord;
    const view = toWorkStudentView({ ...workRecord([leaky]), secretWorkColumn: "COLUNA-NOVA-011" } as WorkRecord);
    expect(JSON.stringify(view)).not.toContain("COLUNA-NOVA-011");
  });
});
