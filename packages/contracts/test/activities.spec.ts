import { describe, expect, it } from "vitest";
import {
  ActivityAiHelpSchema,
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
  StudentActivitySchema,
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
  ActivityExamSchema,
  CreateExamActivityRequestSchema,
  ExamEndReasonSchema,
  ScopeCheckSchema,
  StartAttemptRequestSchema,
  StudentExamEndReasonSchema,
  StudentExamSchema,
} from "../src/index.js";

describe("012 enums das atividades da turma e do portal do aluno", () => {
  it("têm exatamente os valores do data-model", () => {
    // 018 adds EXAM.
    expect(ActivityTypeSchema.options).toEqual(["EXERCISE", "ASSIGNMENT", "EXAM"]);
    // 015 adds CONTROLLED (works only, 015/FR-001).
    expect(ExecutionModeSchema.options).toEqual(["NORMAL", "CONTROLLED"]);
    expect(ActivityStatusSchema.options).toEqual(["ACTIVE", "CLOSED", "CANCELLED"]);
    expect(PublicationPhaseSchema.options).toEqual(["SCHEDULED", "PUBLISHED"]);
    expect(LatePolicySchema.options).toEqual(["REJECT", "ACCEPT_MARKED"]);
    // 013 adds COMPLETED to both statuses (an EXERCISE with a concluded attempt).
    expect(StudentActivityStatusSchema.options).toEqual(["PENDING", "IN_PROGRESS", "OVERDUE", "SUBMITTED", "GRADED", "COMPLETED"]);
    expect(StudentActivityFilterSchema.options).toEqual(["PENDING", "IN_PROGRESS", "OVERDUE", "COMPLETED"]);
    // 016 adds ABSENT (a PRESENT_ONLY work, not marked present and without an attempt).
    // 018 adds the exam's ends, the open hold and the closed start.
    expect(RosterStatusSchema.options).toEqual([
      "NOT_STARTED",
      "IN_PROGRESS",
      "SUBMITTED",
      "SUBMITTED_LATE",
      "MISSED",
      "COMPLETED",
      "ABSENT",
      "AWAITING_DECISION",
      "TIME_EXPIRED",
      "CANCELLED",
      "ENDED_BY_WARNINGS",
      "START_CLOSED",
    ]);
    expect(AttemptStatusSchema.options).toEqual(["IN_PROGRESS", "SUBMITTED"]);
    expect(ActivityGradingStatusSchema.options).toEqual(["GRADED", "PENDING_TEACHER", "DECIDED"]);
  });

  it("012/FR-003 015/FR-001 a prova existe só como EXAM (018); o modo controlado existe desde a 015", () => {
    expect(ActivityTypeSchema.safeParse("EXAM").success).toBe(true);
    for (const value of ["PROVA", "QUIZ"]) expect(ActivityTypeSchema.safeParse(value).success, value).toBe(false);
    expect(ExecutionModeSchema.safeParse("CONTROLLED").success).toBe(true);
    expect(ExecutionModeSchema.safeParse("CONTROLADO").success).toBe(false);
  });

  it("012/SC-012 a prova só aparece como o tipo EXAM (018); CONTROLLED só no modo de execução (015)", () => {
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
    expect(values.filter((value) => /EXAM|PROVA/.test(value))).toEqual(["EXAM"]);
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

describe("015 opções do Trabalho na aplicação, na edição e nas visões (contracts/http-api.md)", () => {
  const work = (overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: uuid(99),
    source: { type: "ASSIGNMENT", workId: uuid(5) },
    title: "Trabalho de POO",
    publishAt: null,
    acknowledgeOutOfScope: false,
    deadline: "2026-10-10T23:59:00.000Z",
    latePolicy: "REJECT",
    ...overrides,
  });
  const exercises = (overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: uuid(99),
    source: { type: "EXERCISE", exerciseIds: [uuid(1)] },
    title: "Prática",
    publishAt: null,
    acknowledgeOutOfScope: false,
    ...overrides,
  });

  it("015/FR-001 o Trabalho aceita modo e ajuda; sem eles, NORMAL e nenhuma ajuda", () => {
    expect(CreateActivityRequestSchema.parse(work())).toMatchObject({ executionMode: "NORMAL", aiHelpAllowance: 0 });
    expect(CreateActivityRequestSchema.parse(work({ executionMode: "CONTROLLED", aiHelpAllowance: 3 }))).toMatchObject({
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
    });
    expect(accepts(UpdateActivityRequestSchema, { version: 1, executionMode: "CONTROLLED", aiHelpAllowance: 3 })).toBe(true);
    expect(accepts(UpdateActivityRequestSchema, { version: 1, executionMode: "EXAM" })).toBe(false);
  });

  it("015/FR-003 outra quantidade de ajudas é recusada na aplicação e na edição", () => {
    for (const value of [1, 2, 4, "3", null]) {
      expect(accepts(CreateActivityRequestSchema, work({ aiHelpAllowance: value })), String(value)).toBe(false);
      expect(accepts(UpdateActivityRequestSchema, { version: 1, aiHelpAllowance: value }), String(value)).toBe(false);
    }
  });

  it("015/FR-002 o Exercício recusa modo controlado e ajuda da IA, até NORMAL e 0", () => {
    expect(accepts(CreateActivityRequestSchema, exercises())).toBe(true);
    for (const extra of [{ executionMode: "CONTROLLED" }, { executionMode: "NORMAL" }, { aiHelpAllowance: 3 }, { aiHelpAllowance: 0 }]) {
      expect(accepts(CreateActivityRequestSchema, exercises(extra)), JSON.stringify(extra)).toBe(false);
    }
  });

  it("015/FR-006 o professor e o aluno recebem o modo e a ajuda; o aluno, também as ajudas já usadas", () => {
    expect(accepts(ActivityAiHelpSchema, { allowance: 3 })).toBe(true);
    expect(accepts(ActivityAiHelpSchema, { allowance: 3, used: 1 })).toBe(false);
    expect(accepts(ActivityAiHelpSchema, { allowance: 2 })).toBe(false);
    const detail = StudentActivitySchema.shape.aiHelp;
    expect(accepts(detail, { allowance: 3, used: 2 })).toBe(true);
    expect(accepts(detail, { allowance: 3 })).toBe(false);
    expect(accepts(detail, { allowance: 3, used: 4 })).toBe(false);
    expect(accepts(RosterEntrySchema.shape.aiHelpUsed, 3)).toBe(true);
    expect(accepts(RosterEntrySchema.shape.aiHelpUsed, null)).toBe(true);
    expect(accepts(RosterEntrySchema.shape.aiHelpUsed, 4)).toBe(false);
    expect(TeacherActivitySummarySchema.shape.aiHelp).toBe(ActivityAiHelpSchema);
    expect(StudentActivitySummarySchema.shape.executionMode).toBe(ExecutionModeSchema);
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
    aiHelp: { allowance: 0 },
    codeExecution: false,
    groupSize: null,
    releaseMode: "ALL_ENROLLED",
    attendance: null,
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
    exam: null,
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
      aiHelpUsed: null,
      markedAt: null,
      pauses: { count: 0, secondsAway: 0, open: false },
      occurrenceCount: null,
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
    execution: null,
  };

  it("012/FR-030 012/FR-032 a questão do aluno é uma lista fechada: um campo de gabarito quebra o contrato", () => {
    expect(accepts(StudentQuestionSchema, question)).toBe(true);
    for (const leak of ["expectedAnswer", "rubric", "expectedSolution", "explanation", "isTrickQuestion", "gradingStrategy"]) {
      expect(accepts(StudentQuestionSchema, { ...question, [leak]: "x" }), leak).toBe(false);
    }
    expect(accepts(StudentQuestionSchema, { ...question, alternatives: [{ id: uuid(2), text: "Animal", isCorrect: true }] })).toBe(false);
    expect(accepts(StudentQuestionSchema, { ...question, publicTestCases: [{ input: "1", expectedOutput: "2", visibility: "PRIVATE" }] })).toBe(false);
  });

  it("019/FR-005 019/FR-014 a questão de Código de um exercício traz a execução; as demais, null; nada de casos privados", () => {
    const execution = { status: "AVAILABLE", languageVersion: "Node.js 24", convention: "STDIN_STDOUT", limits: { timeMs: 2000, memoryMb: 256, outputBytes: 65_536 } };
    expect(accepts(StudentQuestionSchema, { ...question, type: "CODE", execution })).toBe(true);
    expect(accepts(StudentQuestionSchema, { ...question, type: "CODE", execution: { ...execution, status: "NO_PUBLIC_CASES" } })).toBe(true);
    const withoutExecution: Record<string, unknown> = { ...question };
    delete withoutExecution.execution;
    expect(accepts(StudentQuestionSchema, withoutExecution)).toBe(false);
    expect(accepts(StudentQuestionSchema, { ...question, execution: { ...execution, privateCaseCount: 2 } })).toBe(false);
    expect(accepts(StudentQuestionSchema, { ...question, privateTestCases: [] })).toBe(false);
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
    executionMode: "NORMAL",
    aiHelp: { allowance: 0 },
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
      execution: null,
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

describe("016 chamada nas visões das atividades (contracts/http-api.md)", () => {
  const AT = "2026-10-09T13:00:00.000Z";
  const counts = { enrolled: 2, inProgress: 0, submitted: 0, submittedLate: 0, missed: 0, pendingGrading: 0 };
  const summary = {
    id: uuid(1),
    type: "ASSIGNMENT",
    executionMode: "NORMAL",
    aiHelp: { allowance: 0 },
    codeExecution: false,
    groupSize: null,
    releaseMode: "PRESENT_ONLY",
    attendance: { present: 0, enrolled: 2 },
    title: "Trabalho 1",
    status: "ACTIVE",
    phase: "PUBLISHED",
    publishAt: "2026-10-01T00:00:00.000Z",
    deadline: "2026-10-20T00:00:00.000Z",
    latePolicy: "REJECT",
    totalGrade: "10.00",
    possiblePoints: null,
    resultReleasedAt: null,
    counts,
    exerciseCounts: null,
    exam: null,
  };
  const entry = {
    studentUserId: uuid(3),
    name: "Ana",
    enrollment: "ACTIVE",
    status: "ABSENT",
    attemptId: null,
    submittedAt: null,
    grade: null,
    gradePartial: null,
    pointsEarned: null,
    pendingMarks: null,
    aiHelpUsed: 0,
    markedAt: null,
    pauses: { count: 0, secondsAway: 0, open: false },
    occurrenceCount: null,
  };
  const question = {
    id: uuid(5),
    position: 0,
    type: "OPEN_ANSWER",
    value: "10.00",
    points: null,
    statement: "Explique",
    instructions: null,
    starterCode: null,
    language: null,
    publicTestCases: [],
    alternatives: [],
    execution: null,
  };
  const pause = { id: uuid(6), initiatedBy: "STUDENT", reason: "WATER", note: null, startedAt: AT, endedAt: null };
  const detail = (overrides: Record<string, unknown> = {}) => ({
    id: uuid(1),
    type: "ASSIGNMENT",
    executionMode: "NORMAL",
    aiHelp: { allowance: 0, used: 0 },
    groupSize: null,
    group: null,
    title: "Trabalho 1",
    summary: "",
    class: { id: uuid(2), name: "Turma A" },
    subjectName: null,
    teacherName: "Prof",
    publishedAt: "2026-10-01T00:00:00.000Z",
    deadline: "2026-10-20T00:00:00.000Z",
    latePolicy: "REJECT",
    status: "IN_PROGRESS",
    late: false,
    canAnswer: true,
    urgent: false,
    submittedAt: null,
    totalGrade: "10.00",
    points: null,
    instructions: null,
    serverNow: AT,
    questions: [question],
    attempt: { number: 1, startedAt: AT, lastSavedAt: null, answers: [{ questionId: uuid(5), answer: { kind: "TEXT", text: "Herança" }, revision: 1 }] },
    submission: null,
    result: null,
    completedAttempts: [],
    lastResult: null,
    pause: null,
    pauses: [],
    exam: null,
    ...overrides,
  });

  it("016/FR-001 o Trabalho traz o modo de liberação e a chamada; null em ALL_ENROLLED", () => {
    expect(accepts(TeacherActivitySummarySchema, summary)).toBe(true);
    expect(accepts(TeacherActivitySummarySchema, { ...summary, releaseMode: "ALL_ENROLLED", attendance: null })).toBe(true);
    expect(accepts(TeacherActivitySummarySchema, { ...summary, attendance: { present: -1, enrolled: 2 } })).toBe(false);
    expect(accepts(TeacherActivitySummarySchema, { ...summary, releaseMode: undefined })).toBe(false);
    expect(accepts(TeacherActivitySummarySchema, { ...summary, releaseMode: "EVERYONE" })).toBe(false);
  });

  it("016/FR-001 o modo de liberação é do servidor: releaseMode na aplicação ou na edição → 400", () => {
    const work = {
      idempotencyKey: uuid(99),
      source: { type: "ASSIGNMENT", workId: uuid(9) },
      title: "Trabalho 1",
      publishAt: null,
      acknowledgeOutOfScope: false,
      deadline: "2026-10-20T00:00:00.000Z",
      latePolicy: "REJECT",
    };
    expect(accepts(CreateActivityRequestSchema, work)).toBe(true);
    for (const releaseMode of ["PRESENT_ONLY", "ALL_ENROLLED"]) {
      expect(accepts(CreateActivityRequestSchema, { ...work, releaseMode }), releaseMode).toBe(false);
      expect(accepts(UpdateActivityRequestSchema, { version: 1, releaseMode }), releaseMode).toBe(false);
    }
  });

  it("016/FR-019 a linha do aluno: Ausente, horário da presença, número de pausas e tempo fora", () => {
    expect(accepts(RosterEntrySchema, entry)).toBe(true);
    expect(accepts(RosterEntrySchema, { ...entry, status: "IN_PROGRESS", attemptId: uuid(4), markedAt: AT, pauses: { count: 2, secondsAway: 300, open: true } })).toBe(true);
    expect(accepts(RosterEntrySchema, { ...entry, markedAt: undefined })).toBe(false);
    expect(accepts(RosterEntrySchema, { ...entry, pauses: { count: -1, secondsAway: 0, open: false } })).toBe(false);
    expect(accepts(RosterEntrySchema, { ...entry, pauses: { count: 1, secondsAway: 1.5, open: false } })).toBe(false);
    expect(accepts(RosterEntrySchema, { ...entry, pauses: undefined })).toBe(false);
  });

  it("016/FR-013 a atividade pausada vem sem questões e sem respostas; as pausas próprias depois da entrega", () => {
    expect(accepts(StudentActivitySchema, detail())).toBe(true);
    expect(accepts(StudentActivitySchema, detail({ pause, questions: [], attempt: { number: 1, startedAt: AT, lastSavedAt: null, answers: [] } }))).toBe(true);
    expect(accepts(StudentActivitySchema, detail({ pause }))).toBe(false);
    expect(accepts(StudentActivitySchema, detail({ pause, questions: [] }))).toBe(false);
    expect(accepts(StudentActivitySchema, detail({ pauses: [{ ...pause, endedAt: AT }] }))).toBe(true);
    expect(accepts(StudentActivitySchema, detail({ pause: undefined }))).toBe(false);
    expect(accepts(StudentActivitySchema, detail({ pauses: [{ ...pause, releasedById: uuid(7) }] }))).toBe(false);
  });
});

describe("018 a prova como atividade da turma (contracts/http-api.md, research T3, T13, T15)", () => {
  const AT = "2026-10-12T13:00:00.000Z";
  const exam = (overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: uuid(99),
    source: { type: "EXAM", examId: uuid(9) },
    title: "Prova 1",
    publishAt: null,
    acknowledgeOutOfScope: false,
    durationMinutes: 60,
    ...overrides,
  });

  it("018/FR-007 duração de 1 a 120 min, inatividade de 30 a 60 s (padrão 60), limite para iniciar de 0 a 60 min (padrão 15)", () => {
    expect(CreateActivityRequestSchema.parse(exam())).toMatchObject({ inactivityLimitSeconds: 60, startWindowMinutes: 15 });
    for (const durationMinutes of [1, 120]) expect(accepts(CreateExamActivityRequestSchema, exam({ durationMinutes })), String(durationMinutes)).toBe(true);
    for (const durationMinutes of [0, 121, 1.5, "60", undefined]) {
      expect(accepts(CreateActivityRequestSchema, exam({ durationMinutes })), String(durationMinutes)).toBe(false);
    }
    for (const inactivityLimitSeconds of [30, 60]) expect(accepts(CreateExamActivityRequestSchema, exam({ inactivityLimitSeconds }))).toBe(true);
    for (const inactivityLimitSeconds of [29, 61, 45.5]) expect(accepts(CreateExamActivityRequestSchema, exam({ inactivityLimitSeconds }))).toBe(false);
    for (const startWindowMinutes of [0, 60]) expect(accepts(CreateExamActivityRequestSchema, exam({ startWindowMinutes }))).toBe(true);
    for (const startWindowMinutes of [-1, 61, 7.5]) expect(accepts(CreateExamActivityRequestSchema, exam({ startWindowMinutes }))).toBe(false);
  });

  it("018/FR-010 a aplicação da prova recusa modo, ajuda, liberação, prazo e regra de atraso", () => {
    const refused = {
      executionMode: "CONTROLLED",
      aiHelpAllowance: 0,
      releaseMode: "PRESENT_ONLY",
      deadline: "2026-10-20T00:00:00.000Z",
      latePolicy: "REJECT",
      totalGrade: "10.00",
    };
    for (const [field, value] of Object.entries(refused)) {
      expect(accepts(CreateActivityRequestSchema, exam({ [field]: value })), field).toBe(false);
    }
    expect(accepts(CreateActivityRequestSchema, exam({ source: { type: "EXAM", examId: uuid(9), workId: uuid(8) } }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, exam({ source: { type: "EXAM" } }))).toBe(false);
  });

  it("018/FR-008 a verificação antes de aplicar traz a cobertura por tópico e por dificuldade (null fora da prova)", () => {
    const coverage = {
      byTopic: [{ syllabusItemId: uuid(1), title: "Herança", questions: 2, points: "4.00", outOfScope: true }],
      byDifficulty: [{ difficulty: "BASIC", questions: 2, points: "4.00" }],
    };
    expect(accepts(ScopeCheckSchema, { hasPlan: true, outOfScope: [], coverage })).toBe(true);
    expect(accepts(ScopeCheckSchema, { hasPlan: true, outOfScope: [], coverage: null })).toBe(true);
    expect(accepts(ScopeCheckSchema, { hasPlan: true, outOfScope: [] })).toBe(false);
    expect(accepts(ScopeCheckSchema, { hasPlan: true, outOfScope: [], coverage: { ...coverage, byDifficulty: [{ difficulty: "EXPERT", questions: 1, points: "1.00" }] } })).toBe(false);
    expect(accepts(ScopeCheckSchema, { hasPlan: true, outOfScope: [], coverage: { ...coverage, byTopic: [{ ...coverage.byTopic[0], points: "4" }] } })).toBe(false);
  });

  it("018/FR-007 o professor vê os tempos derivados da prova e as decisões pendentes", () => {
    const timing = { durationMinutes: 60, inactivityLimitSeconds: 60, startWindowMinutes: 15, startDeadline: AT, closesAt: AT, pendingDecisions: 0 };
    expect(accepts(ActivityExamSchema, timing)).toBe(true);
    expect(accepts(ActivityExamSchema, { ...timing, pendingDecisions: -1 })).toBe(false);
    expect(accepts(ActivityExamSchema, { ...timing, endsAt: AT })).toBe(false);
    expect(accepts(RosterEntrySchema.shape.occurrenceCount, null)).toBe(true);
    expect(accepts(RosterEntrySchema.shape.occurrenceCount, 4)).toBe(true);
    expect(accepts(RosterEntrySchema.shape.occurrenceCount, -1)).toBe(false);
  });

  it("018/FR-021 os motivos de fim: os gravados, e os do aluno, que leem WARNINGS até a liberação", () => {
    expect(ExamEndReasonSchema.options).toEqual(["STUDENT_SUBMITTED", "TIME_EXPIRED", "ACTIVITY_CLOSED", "ENDED_BY_WARNINGS", "CANCELLED"]);
    expect(StudentExamEndReasonSchema.options).toEqual(["STUDENT_SUBMITTED", "TIME_EXPIRED", "ACTIVITY_CLOSED", "WARNINGS", "CANCELLED"]);
    for (const status of ["AWAITING_DECISION", "TIME_EXPIRED", "CANCELLED", "ENDED_BY_WARNINGS", "START_CLOSED"]) {
      expect(RosterStatusSchema.options, status).toContain(status);
    }
  });

  it("018/FR-011 o início da prova exige aceitar as regras; o de um trabalho continua {}", () => {
    expect(accepts(StartAttemptRequestSchema, {})).toBe(true);
    expect(accepts(StartAttemptRequestSchema, { acceptRules: true })).toBe(true);
    for (const acceptRules of [false, "true", 1]) expect(accepts(StartAttemptRequestSchema, { acceptRules }), String(acceptRules)).toBe(false);
    for (const field of ["startedAt", "endsAt", "serverNow"]) expect(accepts(StartAttemptRequestSchema, { acceptRules: true, [field]: AT }), field).toBe(false);
  });

  it("018/FR-029 a prova do aluno: tempos do servidor, ocorrências de 3 avisos, retenção sem conteúdo", () => {
    const studentExam = {
      durationMinutes: 60,
      inactivityLimitSeconds: 60,
      startDeadline: AT,
      endsAt: AT,
      occurrences: { count: 4, warningsAllowed: 3 },
      hold: { openedAt: AT },
      endReason: null,
      ownOccurrences: [],
    };
    expect(accepts(StudentExamSchema, studentExam)).toBe(true);
    expect(accepts(StudentExamSchema, { ...studentExam, occurrences: { count: 4, warningsAllowed: 4 } })).toBe(false);
    expect(accepts(StudentExamSchema, { ...studentExam, endReason: "ENDED_BY_WARNINGS" })).toBe(false);
    for (const field of ["grade", "resolution", "cancelledBy"]) expect(accepts(StudentExamSchema, { ...studentExam, [field]: null }), field).toBe(false);

    const detail = StudentActivitySchema.safeParse({
      id: uuid(1),
      type: "EXAM",
      executionMode: "CONTROLLED",
      aiHelp: { allowance: 0, used: 0 },
      groupSize: null,
      group: null,
      title: "Prova 1",
      summary: "",
      class: { id: uuid(2), name: "Turma A" },
      subjectName: null,
      teacherName: "Prof",
      publishedAt: AT,
      deadline: null,
      latePolicy: null,
      status: "IN_PROGRESS",
      late: false,
      canAnswer: false,
      urgent: false,
      submittedAt: null,
      totalGrade: "10.00",
      points: null,
      instructions: null,
      serverNow: AT,
      questions: [],
      attempt: { number: 1, startedAt: AT, lastSavedAt: null, answers: [] },
      submission: null,
      result: null,
      completedAttempts: [],
      lastResult: null,
      pause: null,
      pauses: [],
      exam: studentExam,
    });
    expect(detail.success).toBe(true);
    const question = {
      id: uuid(5),
      position: 0,
      type: "OPEN_ANSWER",
      value: "10.00",
      points: null,
      statement: "Explique",
      instructions: null,
      starterCode: null,
      language: null,
      publicTestCases: [],
      alternatives: [],
      execution: null,
    };
    // With a hold open, no statement and no answer reach the student.
    expect(accepts(StudentActivitySchema, { ...detail.data!, questions: [question] })).toBe(false);
    expect(accepts(StudentActivitySchema, { ...detail.data!, questions: [question], exam: { ...studentExam, hold: null } })).toBe(true);
  });
});
