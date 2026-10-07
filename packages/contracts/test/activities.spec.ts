import { describe, expect, it } from "vitest";
import {
  ActivityGradingStatusSchema,
  CreateActivityRequestSchema,
  EXERCISE_POINTS,
  ExerciseResultSchema,
  PointsSchema,
  possiblePoints,
  GradeSubmissionRequestSchema,
  MarkExerciseResultsRequestSchema,
  RetryAttemptRequestSchema,
  RosterEntrySchema,
  SaveAnswersRequestSchema,
  StudentActivitySummarySchema,
  StudentDashboardSchema,
  StudentExerciseAttemptSchema,
  StudentExerciseResultSchema,
  TeacherActivitySummarySchema,
  TeacherExerciseResultSchema,
  TeacherQuestionSchema,
  StudentActivityListQuerySchema,
  StudentQuestionSchema,
  SubmitAttemptRequestSchema,
  UpdateActivityRequestSchema,
  ActivityStatusSchema,
  ActivityTypeSchema,
  AttemptStatusSchema,
  ExecutionModeSchema,
  AI_HELP_ALLOWANCE,
  AiHelpAllowanceSchema,
  SaveAnswerOutcomeSchema,
  SaveAnswersResultSchema,
  LatePolicySchema,
  PublicationPhaseSchema,
  RosterStatusSchema,
  StudentActivityFilterSchema,
  StudentActivityStatusSchema,
} from "../src/index.js";

describe("012 enums das atividades da turma e do portal do aluno", () => {
  it("têm exatamente os valores do data-model", () => {
    expect(ActivityTypeSchema.options).toEqual(["EXERCISE", "ASSIGNMENT"]);
    // 015 adds CONTROLLED (works only, 015/FR-001).
    expect(ExecutionModeSchema.options).toEqual(["NORMAL", "CONTROLLED"]);
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

  it("012/FR-003 015/FR-001 a prova continua reservada; o modo controlado existe desde a 015", () => {
    for (const value of ["EXAM", "PROVA", "QUIZ"]) expect(ActivityTypeSchema.safeParse(value).success, value).toBe(false);
    expect(ExecutionModeSchema.safeParse("CONTROLLED").success).toBe(true);
    expect(ExecutionModeSchema.safeParse("CONTROLADO").success).toBe(false);
  });

  it("012/SC-012 nenhum enum das atividades tem valor de prova; CONTROLLED só no modo de execução (015)", () => {
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
    expect(values.filter((value) => /EXAM|PROVA/.test(value))).toEqual([]);
    expect(values.filter((value) => /CONTROL/.test(value))).toEqual(["CONTROLLED"]);
  });
});

describe("015 modo controlado e ajuda da IA (contracts/http-api.md)", () => {
  it("015/FR-003 a ajuda da IA vale exatamente 3 ajudas, ou nenhuma", () => {
    expect(AI_HELP_ALLOWANCE).toBe(3);
    expect(accepts(AiHelpAllowanceSchema, 0)).toBe(true);
    expect(accepts(AiHelpAllowanceSchema, 3)).toBe(true);
    for (const value of [1, 2, 4, 5, -1, 3.5, "3"]) expect(accepts(AiHelpAllowanceSchema, value), String(value)).toBe(false);
  });

  it("015/FR-013c um salvamento acima do limite de digitação devolve a resposta guardada e sua revisão, sem a resposta", () => {
    const savedAt = "2026-10-07T12:00:00.000Z";
    const limited = { questionId: uuid(1), outcome: "TYPING_LIMIT_EXCEEDED", revision: 2 };
    expect(SaveAnswerOutcomeSchema.options).toEqual(["SAVED", "UNCHANGED", "CONFLICT", "TYPING_LIMIT_EXCEEDED"]);
    expect(accepts(SaveAnswersResultSchema, { savedAt, results: [limited] })).toBe(true);
    // Never saved before: revision 0.
    expect(accepts(SaveAnswersResultSchema, { savedAt, results: [{ ...limited, revision: 0 }] })).toBe(true);
    expect(accepts(SaveAnswersResultSchema, { savedAt, results: [{ ...limited, answer: { kind: "TEXT", text: "colado" } }] })).toBe(false);
    expect(accepts(SaveAnswersResultSchema, { savedAt, results: [{ ...limited, revision: -1 }] })).toBe(false);
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
  /** Since 013 an EXERCISE body has no grade, deadline or late policy. */
  const body = (overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: uuid(99),
    source: exercises(3),
    title: "Herança em Java",
    publishAt: null,
    acknowledgeOutOfScope: false,
    ...overrides,
  });
  const work = (overrides: Record<string, unknown> = {}) =>
    body({ source: { type: "ASSIGNMENT", workId: uuid(5) }, deadline: "2026-10-10T23:59:00.000Z", latePolicy: "REJECT", ...overrides });

  it("012/FR-001 1 a 10 exercícios distintos, ou um trabalho", () => {
    expect(accepts(CreateActivityRequestSchema, body({ source: exercises(0) }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, body({ source: exercises(1) }))).toBe(true);
    expect(accepts(CreateActivityRequestSchema, body({ source: exercises(10) }))).toBe(true);
    expect(accepts(CreateActivityRequestSchema, body({ source: exercises(11) }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, body({ source: { type: "EXERCISE", exerciseIds: [uuid(1), uuid(1)] } }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, work())).toBe(true);
  });

  it("012/FR-001 o Trabalho leva a nota do próprio trabalho: nota total no corpo é recusada", () => {
    expect(accepts(CreateActivityRequestSchema, work({ totalGrade: "1.00" }))).toBe(false);
  });

  it("013/FR-001 o Exercício não tem nota, prazo nem regra de atraso: qualquer um deles no corpo é recusado", () => {
    expect(accepts(CreateActivityRequestSchema, body())).toBe(true);
    for (const [field, value] of [
      ["totalGrade", "1.00"],
      ["deadline", "2026-10-10T23:59:00.000Z"],
      ["latePolicy", "REJECT"],
    ] as const) {
      expect(accepts(CreateActivityRequestSchema, body({ [field]: value })), field).toBe(false);
    }
  });

  it("012/FR-005 o Trabalho exige prazo e regra; o prazo vem depois da publicação", () => {
    const publishAt = "2026-10-10T23:59:00.000Z";
    expect(accepts(CreateActivityRequestSchema, work({ deadline: undefined }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, work({ latePolicy: undefined }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, work({ publishAt }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, work({ publishAt: "2026-10-09T00:00:00.000Z" }))).toBe(true);
    expect(accepts(UpdateActivityRequestSchema, { version: 1, publishAt, deadline: "2026-10-01T00:00:00.000Z" })).toBe(false);
    expect(accepts(UpdateActivityRequestSchema, { version: 1, deadline: "2026-10-01T00:00:00.000Z" })).toBe(true);
  });

  it("campos do servidor são recusados no corpo (mass assignment)", () => {
    for (const field of ["teacherId", "status", "value", "gradingStrategy", "executionMode", "type", "points", "difficulty", "possiblePoints"]) {
      expect(accepts(CreateActivityRequestSchema, body({ [field]: "x" })), field).toBe(false);
      expect(accepts(CreateActivityRequestSchema, work({ [field]: "x" })), field).toBe(false);
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

describe("013 contratos do professor (contracts/http-api.md)", () => {
  const counts = { enrolled: 2, inProgress: 0, submitted: 0, submittedLate: 0, missed: 0, pendingGrading: 0 };
  const summary = {
    id: uuid(1),
    type: "EXERCISE",
    executionMode: "NORMAL",
    title: "Prática",
    status: "ACTIVE",
    phase: "PUBLISHED",
    publishAt: "2026-10-01T00:00:00.000Z",
    deadline: null,
    latePolicy: null,
    totalGrade: null,
    possiblePoints: 105,
    resultReleasedAt: null,
    counts,
    exerciseCounts: { completed: 0, pendingMarks: 0 },
  };

  it("013/FR-013 o Exercício vem sem nota, prazo e regra, com os pontos possíveis", () => {
    expect(accepts(TeacherActivitySummarySchema, summary)).toBe(true);
    expect(accepts(TeacherActivitySummarySchema, { ...summary, exerciseCounts: null })).toBe(true);
    expect(accepts(TeacherActivitySummarySchema, { ...summary, exerciseCounts: { completed: -1, pendingMarks: 0 } })).toBe(false);
    expect(accepts(TeacherActivitySummarySchema, { ...summary, exerciseCounts: undefined })).toBe(false);
    expect(accepts(TeacherActivitySummarySchema, { ...summary, possiblePoints: 1.5 })).toBe(false);
    expect(accepts(TeacherActivitySummarySchema, { ...summary, possiblePoints: undefined })).toBe(false);
  });

  it("013/FR-002 a questão do Exercício leva nível e pontos, sem valor", () => {
    const question = {
      id: uuid(2),
      position: 0,
      type: "OPEN_ANSWER",
      gradingStrategy: "AI_REVIEW",
      value: null,
      difficulty: "INTERMEDIATE",
      points: 30,
      statement: "Explique",
      instructions: null,
      starterCode: null,
      language: null,
      expectedAnswer: "Herança",
      rubric: null,
      expectedSolution: null,
      explanation: "Porque",
      isTrickQuestion: false,
      alternatives: [],
      testCases: [],
      topics: [],
    };
    expect(accepts(TeacherQuestionSchema, question)).toBe(true);
    expect(accepts(TeacherQuestionSchema, { ...question, difficulty: "EXPERT" })).toBe(false);
  });

  it("013/FR-016 a linha do aluno leva os pontos e as marcações pendentes (null no Trabalho)", () => {
    const entry = {
      studentUserId: uuid(3),
      name: "Ana",
      enrollment: "ACTIVE",
      status: "COMPLETED",
      attemptId: uuid(4),
      submittedAt: null,
      grade: null,
      gradePartial: null,
      pointsEarned: 45,
      pendingMarks: 1,
    };
    expect(accepts(RosterEntrySchema, entry)).toBe(true);
    expect(accepts(RosterEntrySchema, { ...entry, pointsEarned: null, pendingMarks: null })).toBe(true);
    expect(accepts(RosterEntrySchema, { ...entry, pendingMarks: -1 })).toBe(false);
  });

  it("013/FR-009 o resultado do professor: resultado, pontos, linha que pontua e decisão", () => {
    const result = {
      questionId: uuid(2),
      result: "PENDING_TEACHER",
      points: 0,
      scoring: true,
      alreadyScored: false,
      nature: null,
      comment: null,
      decidedAt: null,
    };
    expect(accepts(TeacherExerciseResultSchema, result)).toBe(true);
    expect(accepts(TeacherExerciseResultSchema, { ...result, nature: "SUGGESTION" })).toBe(false);
  });

  it("013/FR-017 marcar: 1 a 10 questões distintas, só certo ou errado, comentário até 2 000", () => {
    const mark = (n: number, extra: Record<string, unknown> = {}) => ({ questionId: uuid(n), result: "CORRECT", ...extra });
    expect(accepts(MarkExerciseResultsRequestSchema, { marks: [mark(1), mark(2, { result: "WRONG", comment: "Faltou o caso base" })] })).toBe(true);
    expect(accepts(MarkExerciseResultsRequestSchema, { marks: [] })).toBe(false);
    expect(accepts(MarkExerciseResultsRequestSchema, { marks: Array.from({ length: 11 }, (_, i) => mark(i + 1)) })).toBe(false);
    expect(accepts(MarkExerciseResultsRequestSchema, { marks: [mark(1), mark(1)] })).toBe(false);
    for (const result of ["PENDING_TEACHER", "UNSCORED", "PARTIAL"]) {
      expect(accepts(MarkExerciseResultsRequestSchema, { marks: [mark(1, { result })] }), result).toBe(false);
    }
    expect(accepts(MarkExerciseResultsRequestSchema, { marks: [mark(1, { comment: "x".repeat(2001) })] })).toBe(false);
    for (const field of ["points", "grade", "scoring", "nature"]) {
      expect(accepts(MarkExerciseResultsRequestSchema, { marks: [mark(1, { [field]: 1 })] }), field).toBe(false);
    }
  });
});

describe("012 contratos do aluno (contracts/http-api.md)", () => {
  const question = {
    id: uuid(1),
    position: 0,
    type: "MULTIPLE_CHOICE",
    value: "0.50",
    points: null,
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

describe("013 contratos do aluno (contracts/http-api.md)", () => {
  const summary = {
    id: uuid(1),
    type: "EXERCISE",
    title: "Prática",
    summary: "",
    class: { id: uuid(2), name: "Turma A" },
    subjectName: null,
    teacherName: "Prof",
    publishedAt: "2026-10-01T00:00:00.000Z",
    deadline: null,
    latePolicy: null,
    status: "COMPLETED",
    late: false,
    canAnswer: true,
    urgent: false,
    submittedAt: null,
    totalGrade: null,
    result: null,
    points: { possible: 105, earned: 45, awaitingCorrection: true },
  };

  it("013/FR-013 o Exercício do aluno vem sem nota, prazo e regra, com os pontos", () => {
    expect(accepts(StudentActivitySummarySchema, summary)).toBe(true);
    expect(accepts(StudentActivitySummarySchema, { ...summary, points: null })).toBe(true);
    expect(accepts(StudentActivitySummarySchema, { ...summary, points: { possible: 105, earned: 4.5, awaitingCorrection: false } })).toBe(false);
  });

  it("013/FR-011 a questão do aluno continua sem gabarito: um campo de gabarito ou resultado quebra o contrato", () => {
    const question = {
      id: uuid(3),
      position: 0,
      type: "OPEN_ANSWER",
      value: null,
      points: 30,
      statement: "Explique",
      instructions: null,
      starterCode: null,
      language: null,
      publicTestCases: [],
      alternatives: [],
    };
    expect(accepts(StudentQuestionSchema, question)).toBe(true);
    for (const leak of ["expectedAnswer", "expectedSolution", "explanation", "correctAlternativeId", "result", "difficulty"]) {
      expect(accepts(StudentQuestionSchema, { ...question, [leak]: "x" }), leak).toBe(false);
    }
  });

  it("013/FR-012 o resultado da tentativa concluída é uma lista fechada", () => {
    const result = {
      questionId: uuid(3),
      position: 0,
      answer: { kind: "TEXT", text: "Herança" },
      result: "UNSCORED",
      points: 0,
      alreadyScored: false,
      correctAlternativeId: null,
      expectedAnswer: "Herança",
      expectedSolution: null,
      explanation: "Porque",
      teacherComment: null,
    };
    expect(accepts(StudentExerciseResultSchema, result)).toBe(true);
    for (const leak of ["rubric", "isTrickQuestion", "scoring", "nature", "decidedById"]) {
      expect(accepts(StudentExerciseResultSchema, { ...result, [leak]: "x" }), leak).toBe(false);
    }
    const attempt = { number: 2, completedAt: "2026-10-02T00:00:00.000Z", first: false, pointsEarned: 0, questions: [result] };
    expect(accepts(StudentExerciseAttemptSchema, attempt)).toBe(true);
    expect(accepts(StudentExerciseAttemptSchema, { ...attempt, number: 0 })).toBe(false);
  });

  it("013/FR-005 refazer nomeia a tentativa que segue, um inteiro ≥ 1, e nada mais", () => {
    expect(accepts(RetryAttemptRequestSchema, { afterNumber: 1 })).toBe(true);
    for (const afterNumber of [0, 1.5, "1"]) expect(accepts(RetryAttemptRequestSchema, { afterNumber }), String(afterNumber)).toBe(false);
    expect(accepts(RetryAttemptRequestSchema, { afterNumber: 1, number: 2 })).toBe(false);
  });

  it("013/FR-021 o painel leva o ranking de cada turma, até 5 linhas", () => {
    const row = (position: number) => ({ position, name: `Aluno ${position}`, points: 10, isViewer: false });
    const dashboard = {
      firstName: "Ana",
      counts: { pending: 0, inProgress: 0, overdue: 0, completed: 1 },
      next: [],
      overdueOpen: [],
      rankings: [{ class: { id: uuid(2), name: "Turma A" }, top: [1, 2, 3, 4, 5].map(row) }],
      serverNow: "2026-10-03T00:00:00.000Z",
    };
    expect(accepts(StudentDashboardSchema, dashboard)).toBe(true);
    expect(accepts(StudentDashboardSchema, { ...dashboard, rankings: [{ ...dashboard.rankings[0], top: [1, 2, 3, 4, 5, 6].map(row) }] })).toBe(false);
  });
});
