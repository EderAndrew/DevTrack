import { StudentActivitySchema, StudentActivitySummarySchema, TeacherQuestionSchema, TestCaseVisibilitySchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import type { AssignmentFacts } from "../status/facts";
import type { ActivityQuestionRow } from "./rows";
import { type StudentActivityDetailInput, summaryOf, toStudentActivity, toStudentSummary } from "./student-view";
import { toTeacherQuestion } from "./teacher-view";

/** Planted in every answer-key field: none may reach a student (012/SC-003). */
const MARKERS = ["MARCADOR-RESPOSTA-012", "MARCADOR-RUBRICA-012", "MARCADOR-SOLUCAO-012", "MARCADOR-PRIVADO-012", "MARCADOR-EXPLICACAO-012"];
const CORRECT = "00000000-0000-4000-8000-00000000c0de";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const row = (overrides: Partial<ActivityQuestionRow>): ActivityQuestionRow => ({
  id: id(1),
  position: 0,
  type: "OPEN_ANSWER",
  gradingStrategy: "AI_REVIEW",
  valueCents: 50,
  difficulty: null,
  points: null,
  statement: "Enunciado visível",
  instructions: null,
  starterCode: null,
  language: null,
  expectedAnswer: null,
  rubric: null,
  expectedSolution: null,
  explanation: "MARCADOR-EXPLICACAO-012",
  isTrickQuestion: false,
  alternatives: [],
  testCases: [],
  topics: [],
  ...overrides,
});

const QUESTIONS: ActivityQuestionRow[] = [
  row({ id: id(1), position: 0, expectedAnswer: "MARCADOR-RESPOSTA-012", rubric: "MARCADOR-RUBRICA-012", valueCents: 30 }),
  row({
    id: id(2),
    position: 1,
    type: "MULTIPLE_CHOICE",
    gradingStrategy: "EXACT_MATCH",
    valueCents: 40,
    isTrickQuestion: true,
    alternatives: [
      { id: id(21), position: 1, text: "Errada", isCorrect: false },
      { id: CORRECT, position: 0, text: "Certa", isCorrect: true },
      { id: id(22), position: 2, text: "Outra", isCorrect: false },
    ],
  }),
  row({
    id: id(3),
    position: 2,
    type: "CODE",
    gradingStrategy: "TEST_CASES",
    valueCents: 30,
    instructions: "Implemente",
    starterCode: "class A {}",
    language: { id: id(30), name: "Java" },
    expectedSolution: "MARCADOR-SOLUCAO-012",
    testCases: [
      { position: 1, input: "MARCADOR-PRIVADO-012", expectedOutput: "MARCADOR-PRIVADO-012", visibility: "PRIVATE" },
      { position: 0, input: "1", expectedOutput: "2", visibility: "PUBLIC" },
    ],
  }),
];

const facts = (overrides: Partial<AssignmentFacts> = {}): AssignmentFacts => ({
  type: "ASSIGNMENT",
  activityStatus: "ACTIVE",
  deadline: new Date("2026-10-10T23:59:00.000Z"),
  latePolicy: "REJECT",
  classActive: true,
  attempt: { status: "SUBMITTED" },
  submission: { late: false, gradingComplete: true },
  released: false,
  now: new Date("2026-10-05T12:00:00.000Z"),
  ...overrides,
});

const input = (overrides: Partial<StudentActivityDetailInput> = {}): StudentActivityDetailInput => ({
  id: id(100),
  type: "ASSIGNMENT",
  title: "Sistema Bancário",
  instructions: "Leia com atenção.",
  class: { id: id(200), name: "POO 2026" },
  subjectName: "Programação Orientada a Objetos",
  teacherName: "Ana Professora",
  publishAt: new Date("2026-10-01T12:00:00.000Z"),
  deadline: new Date("2026-10-10T23:59:00.000Z"),
  latePolicy: "REJECT",
  totalCents: 100,
  points: null,
  facts: facts(),
  canSeeResults: true,
  questions: QUESTIONS,
  attempt: { number: 1, startedAt: new Date("2026-10-02T12:00:00.000Z"), lastSavedAt: null, answers: [] },
  completedAttempts: [],
  lastResult: null,
  submission: {
    submittedAt: new Date("2026-10-04T12:00:00.000Z"),
    late: false,
    acceptedByTeacher: false,
    blankCount: 0,
    gradeCents: 70,
    generalFeedback: "Bom trabalho",
    gradings: [
      { questionId: id(1), finalCents: 30, feedback: "Completo" },
      { questionId: id(2), finalCents: 40, feedback: null },
      { questionId: id(3), finalCents: 0, feedback: null },
    ],
  },
  ...overrides,
});

const serialized = (value: unknown) => JSON.stringify(value);

describe("012/FR-030 012/FR-032 visão do aluno por lista fechada (research P15)", () => {
  it("012/SC-003 nenhum marcador de gabarito, nem a marcação da correta, em nenhuma situação — nem depois da liberação", () => {
    for (const released of [false, true]) {
      const body = serialized(toStudentActivity(input({ facts: facts({ released }) })));
      for (const marker of MARKERS) expect(body, `${marker} released=${released}`).not.toContain(marker);
      for (const field of ["isCorrect", "expectedAnswer", "rubric", "expectedSolution", "explanation", "isTrickQuestion", "gradingStrategy", "pendingReason"]) {
        expect(body, field).not.toContain(`"${field}"`);
      }
    }
  });

  it("a questão do aluno traz só o permitido: alternativas na ordem, casos públicos, linguagem pelo nome", () => {
    const [, choice, code] = toStudentActivity(input()).questions;
    expect(choice!.alternatives).toEqual([
      { id: CORRECT, text: "Certa" },
      { id: id(21), text: "Errada" },
      { id: id(22), text: "Outra" },
    ]);
    expect(code).toMatchObject({ publicTestCases: [{ input: "1", expectedOutput: "2" }], language: { name: "Java" }, starterCode: "class A {}" });
  });

  it("012/FR-029 012/SC-004 sem liberação, nenhuma nota nem feedback na resposta, mesmo com a correção feita", () => {
    const detail = toStudentActivity(input());
    expect(detail.result).toBeNull();
    expect(detail.status).toBe("SUBMITTED");
    expect(serialized(detail)).not.toContain("Bom trabalho");
    expect(serialized(detail)).not.toContain("Completo");
    expect(toStudentSummary(input()).result).toBeNull();
  });

  it("liberada com correção incompleta continua sem resultado", () => {
    const detail = toStudentActivity(input({ facts: facts({ released: true, submission: { late: false, gradingComplete: false } }) }));
    expect(detail.result).toBeNull();
    expect(detail.status).toBe("SUBMITTED");
  });

  it("liberada e completa: nota total, por questão e feedback; sem notas.proprias.visualizar, nada", () => {
    const released = input({ facts: facts({ released: true }) });
    const detail = toStudentActivity(released);
    expect(detail.status).toBe("GRADED");
    expect(detail.result).toEqual({
      grade: "0.70",
      generalFeedback: "Bom trabalho",
      questions: [
        { questionId: id(1), grade: "0.30", feedback: "Completo" },
        { questionId: id(2), grade: "0.40", feedback: null },
        { questionId: id(3), grade: "0.00", feedback: null },
      ],
    });
    expect(toStudentSummary(released).result).toEqual({ grade: "0.70", hasFeedback: true });
    expect(toStudentActivity({ ...released, canSeeResults: false }).result).toBeNull();
  });

  it("as visões respeitam os contratos estritos (um campo a mais quebraria o parse)", () => {
    for (const released of [false, true]) {
      expect(StudentActivitySchema.safeParse(toStudentActivity(input({ facts: facts({ released }) }))).success).toBe(true);
      expect(StudentActivitySummarySchema.safeParse(toStudentSummary(input({ facts: facts({ released }) }))).success).toBe(true);
    }
  });

  it("o resumo são os primeiros 160 caracteres das instruções, sem quebras", () => {
    expect(summaryOf(null)).toBe("");
    expect(summaryOf("  Leia\n\ncom   atenção. ")).toBe("Leia com atenção.");
    const long = summaryOf("a".repeat(300));
    expect(long).toHaveLength(160);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("visão do professor", () => {
  it("traz o snapshot completo, com gabarito, em ordem", () => {
    const view = toTeacherQuestion(QUESTIONS[1]!);
    expect(TeacherQuestionSchema.safeParse(view).success).toBe(true);
    expect(view.alternatives.map((alternative) => [alternative.text, alternative.isCorrect])).toEqual([
      ["Certa", true],
      ["Errada", false],
      ["Outra", false],
    ]);
    expect(toTeacherQuestion(QUESTIONS[2]!).testCases.map((testCase) => testCase.visibility)).toEqual(TestCaseVisibilitySchema.options);
  });
});
