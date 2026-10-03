import { describe, expect, it } from "vitest";
import {
  ActivityGradingStatusSchema,
  CreateActivityRequestSchema,
  EXERCISE_POINTS,
  ExerciseResultSchema,
  PointsSchema,
  possiblePoints,
  GradeSubmissionRequestSchema,
  SaveAnswersRequestSchema,
  StudentActivityListQuerySchema,
  StudentQuestionSchema,
  SubmitAttemptRequestSchema,
  UpdateActivityRequestSchema,
  ActivityStatusSchema,
  ActivityTypeSchema,
  AttemptStatusSchema,
  ExecutionModeSchema,
  LatePolicySchema,
  PublicationPhaseSchema,
  RosterStatusSchema,
  StudentActivityFilterSchema,
  StudentActivityStatusSchema,
} from "../src/index.js";

describe("012 enums das atividades da turma e do portal do aluno", () => {
  it("têm exatamente os valores do data-model", () => {
    expect(ActivityTypeSchema.options).toEqual(["EXERCISE", "ASSIGNMENT"]);
    expect(ExecutionModeSchema.options).toEqual(["NORMAL"]);
    expect(ActivityStatusSchema.options).toEqual(["ACTIVE", "CLOSED", "CANCELLED"]);
    expect(PublicationPhaseSchema.options).toEqual(["SCHEDULED", "PUBLISHED"]);
    expect(LatePolicySchema.options).toEqual(["REJECT", "ACCEPT_MARKED"]);
    // 013 adds COMPLETED to both statuses (an EXERCISE with a concluded attempt).
    expect(StudentActivityStatusSchema.options).toEqual(["PENDING", "IN_PROGRESS", "OVERDUE", "SUBMITTED", "GRADED", "COMPLETED"]);
    expect(StudentActivityFilterSchema.options).toEqual(["PENDING", "IN_PROGRESS", "OVERDUE", "COMPLETED"]);
    expect(RosterStatusSchema.options).toEqual(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "SUBMITTED_LATE", "MISSED", "COMPLETED"]);
    expect(AttemptStatusSchema.options).toEqual(["IN_PROGRESS", "SUBMITTED"]);
    expect(ActivityGradingStatusSchema.options).toEqual(["GRADED", "PENDING_TEACHER", "DECIDED"]);
  });

  it("012/FR-003 prova e modo controlado ficam reservados: nenhum enum os aceita", () => {
    for (const value of ["EXAM", "PROVA", "QUIZ"]) expect(ActivityTypeSchema.safeParse(value).success, value).toBe(false);
    for (const value of ["CONTROLLED", "CONTROLADO"]) expect(ExecutionModeSchema.safeParse(value).success, value).toBe(false);
  });

  it("012/SC-012 nenhum enum da 012 tem valor de prova ou de modo controlado", () => {
    const schemas = [
      ActivityTypeSchema,
      ExecutionModeSchema,
      ActivityStatusSchema,
      PublicationPhaseSchema,
      LatePolicySchema,
      StudentActivityStatusSchema,
      StudentActivityFilterSchema,
      RosterStatusSchema,
      AttemptStatusSchema,
      ActivityGradingStatusSchema,
    ];
    const values = schemas.flatMap((schema) => schema.options.map(String));
    expect(values.filter((value) => /EXAM|PROVA|CONTROL/.test(value))).toEqual([]);
  });
});

describe("013 pontos dos exercícios (research K2)", () => {
  it("013/FR-002 cada nível vale pontos fixos: Básico 15, Intermediário 30, Avançado 60", () => {
    expect(EXERCISE_POINTS).toEqual({ BASIC: 15, INTERMEDIATE: 30, ADVANCED: 60 });
  });

  it("013/FR-003 o total possível é a soma dos pontos dos exercícios", () => {
    expect(possiblePoints(["BASIC", "INTERMEDIATE", "ADVANCED"])).toBe(105);
    expect(possiblePoints(["BASIC", "BASIC"])).toBe(30);
    expect(possiblePoints([])).toBe(0);
  });

  it("pontos são inteiros não negativos: decimal e negativo são recusados", () => {
    for (const value of [0, 15, 105]) expect(PointsSchema.safeParse(value).success, String(value)).toBe(true);
    for (const value of [1.5, -15, "15", null]) expect(PointsSchema.safeParse(value).success, String(value)).toBe(false);
  });

  it("013/FR-009 o resultado de um exercício tem exatamente os valores do data-model", () => {
    expect(ExerciseResultSchema.options).toEqual(["CORRECT", "WRONG", "PENDING_TEACHER", "UNSCORED"]);
  });
});

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

describe("012 contratos do professor (contracts/http-api.md)", () => {
  const exercises = (count: number) => ({ type: "EXERCISE", exerciseIds: Array.from({ length: count }, (_, index) => uuid(index + 1)) });
  const body = (overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: uuid(99),
    source: exercises(3),
    title: "Herança em Java",
    totalGrade: "1.00",
    publishAt: null,
    deadline: "2026-10-10T23:59:00.000Z",
    latePolicy: "REJECT",
    acknowledgeOutOfScope: false,
    ...overrides,
  });

  it("012/FR-001 1 a 10 exercícios distintos, ou um trabalho", () => {
    expect(accepts(CreateActivityRequestSchema, body({ source: exercises(0) }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, body({ source: exercises(1) }))).toBe(true);
    expect(accepts(CreateActivityRequestSchema, body({ source: exercises(10) }))).toBe(true);
    expect(accepts(CreateActivityRequestSchema, body({ source: exercises(11) }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, body({ source: { type: "EXERCISE", exerciseIds: [uuid(1), uuid(1)] } }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, body({ source: { type: "ASSIGNMENT", workId: uuid(5) }, totalGrade: undefined }))).toBe(true);
  });

  it("012/FR-001 nota total obrigatória no Exercício, recusada no Trabalho, entre 0,01 e 100,00 e ≥ 0,01 por questão", () => {
    expect(accepts(CreateActivityRequestSchema, body({ totalGrade: undefined }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, body({ source: { type: "ASSIGNMENT", workId: uuid(5) } }))).toBe(false);
    for (const grade of ["0.00", "100.01", "0.505", "1,00"]) expect(accepts(CreateActivityRequestSchema, body({ totalGrade: grade })), grade).toBe(false);
    expect(accepts(CreateActivityRequestSchema, body({ totalGrade: "0.02" }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, body({ totalGrade: "0.03" }))).toBe(true);
    expect(accepts(CreateActivityRequestSchema, body({ totalGrade: "100" }))).toBe(true);
  });

  it("012/FR-005 o prazo vem depois da publicação", () => {
    const publishAt = "2026-10-10T23:59:00.000Z";
    expect(accepts(CreateActivityRequestSchema, body({ publishAt }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, body({ publishAt: "2026-10-09T00:00:00.000Z" }))).toBe(true);
    expect(accepts(UpdateActivityRequestSchema, { version: 1, publishAt, deadline: "2026-10-01T00:00:00.000Z" })).toBe(false);
    expect(accepts(UpdateActivityRequestSchema, { version: 1, deadline: "2026-10-01T00:00:00.000Z" })).toBe(true);
  });

  it("campos do servidor são recusados no corpo (mass assignment)", () => {
    for (const field of ["teacherId", "status", "value", "gradingStrategy", "executionMode", "type"]) {
      expect(accepts(CreateActivityRequestSchema, body({ [field]: "x" })), field).toBe(false);
    }
    expect(accepts(UpdateActivityRequestSchema, { version: 1, status: "CLOSED" })).toBe(false);
  });

  it("012/FR-006 a nota do professor por questão vai de 0 a 100,00 com até duas casas, decisões distintas", () => {
    const decision = (grade: string) => ({ version: 1, decisions: [{ questionId: uuid(1), grade }] });
    for (const grade of ["0", "0.00", "0.05", "100.00"]) expect(accepts(GradeSubmissionRequestSchema, decision(grade)), grade).toBe(true);
    for (const grade of ["-1", "0.005", "100.01", "1,5"]) expect(accepts(GradeSubmissionRequestSchema, decision(grade)), grade).toBe(false);
    expect(
      accepts(GradeSubmissionRequestSchema, {
        version: 1,
        decisions: [
          { questionId: uuid(1), grade: "0" },
          { questionId: uuid(1), grade: "0.01" },
        ],
      }),
    ).toBe(false);
    expect(accepts(GradeSubmissionRequestSchema, { version: 1, decisions: [], generalFeedback: "x".repeat(5001) })).toBe(false);
  });
});

describe("012 contratos do aluno (contracts/http-api.md)", () => {
  const question = {
    id: uuid(1),
    position: 0,
    type: "MULTIPLE_CHOICE",
    value: "0.50",
    statement: "Qual é a superclasse?",
    instructions: null,
    starterCode: null,
    language: null,
    publicTestCases: [],
    alternatives: [{ id: uuid(2), text: "Animal" }],
  };

  it("012/FR-030 012/FR-032 a questão do aluno é uma lista fechada: um campo de gabarito quebra o contrato", () => {
    expect(accepts(StudentQuestionSchema, question)).toBe(true);
    for (const leak of ["expectedAnswer", "rubric", "expectedSolution", "explanation", "isTrickQuestion", "gradingStrategy"]) {
      expect(accepts(StudentQuestionSchema, { ...question, [leak]: "x" }), leak).toBe(false);
    }
    expect(accepts(StudentQuestionSchema, { ...question, alternatives: [{ id: uuid(2), text: "Animal", isCorrect: true }] })).toBe(false);
    expect(accepts(StudentQuestionSchema, { ...question, publicTestCases: [{ input: "1", expectedOutput: "2", visibility: "PRIVATE" }] })).toBe(false);
  });

  it("012/FR-017 salvar leva de 1 a 10 respostas distintas com a revisão de base", () => {
    const item = (n: number) => ({ questionId: uuid(n), answer: { kind: "TEXT", text: "Herança" }, baseRevision: 0 });
    expect(accepts(SaveAnswersRequestSchema, { answers: [] })).toBe(false);
    expect(accepts(SaveAnswersRequestSchema, { answers: [item(1)] })).toBe(true);
    expect(accepts(SaveAnswersRequestSchema, { answers: Array.from({ length: 10 }, (_, i) => item(i + 1)) })).toBe(true);
    expect(accepts(SaveAnswersRequestSchema, { answers: Array.from({ length: 11 }, (_, i) => item(i + 1)) })).toBe(false);
    expect(accepts(SaveAnswersRequestSchema, { answers: [item(1), item(1)] })).toBe(false);
    expect(accepts(SaveAnswersRequestSchema, { answers: [{ ...item(1), baseRevision: -1 }] })).toBe(false);
    expect(accepts(SaveAnswersRequestSchema, { answers: [{ ...item(1), answer: { kind: "TEXT", text: "x".repeat(20_001) } }] })).toBe(false);
    expect(accepts(SubmitAttemptRequestSchema, { answers: [] })).toBe(true);
  });

  it("012/FR-008 o aluno não manda dono, situação, data, atraso nem nota", () => {
    for (const field of ["studentUserId", "status", "submittedAt", "late", "grade", "attemptId"]) {
      expect(accepts(SubmitAttemptRequestSchema, { answers: [], [field]: "x" }), field).toBe(false);
      expect(
        accepts(SaveAnswersRequestSchema, { answers: [{ questionId: uuid(1), answer: { kind: "TEXT", text: "x" }, baseRevision: 0, [field]: "x" }] }),
        field,
      ).toBe(false);
    }
  });

  it("filtros da lista: situação, tipo, cursor e página de até 50", () => {
    expect(accepts(StudentActivityListQuerySchema, { status: "COMPLETED", type: "ASSIGNMENT", pageSize: "20" })).toBe(true);
    expect(accepts(StudentActivityListQuerySchema, { status: "GRADED" })).toBe(false);
    expect(accepts(StudentActivityListQuerySchema, { pageSize: "51" })).toBe(false);
    expect(accepts(StudentActivityListQuerySchema, { studentUserId: uuid(1) })).toBe(false);
  });
});
