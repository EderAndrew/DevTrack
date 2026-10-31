import { describe, expect, it } from "vitest";
import {
  AttemptCodeRunSummarySchema,
  CODE_RUN_MAX_SOURCE_BYTES,
  CodeRunnerAvailabilitySchema,
  CreateActivityRequestSchema,
  CreateAssignmentRequestSchema,
  CreateExamActivityRequestSchema,
  CreateExerciseActivityRequestSchema,
  ErrorCodeSchema,
  UpdateActivityRequestSchema,
  CODE_RUN_POLL_MS,
  CodeRunSchema,
  CodeRunUnavailableReasonSchema,
  CreateCodeRunRequestSchema,
  ErrorBodySchema,
  ExecutionKeySchema,
  LatestCodeRunSchema,
  QuestionExecutionSchema,
  QuestionExecutionStatusSchema,
  TEST_CASES_MAX,
  utf8ByteLength,
} from "../src/index.js";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (
  schema: { safeParse: (value: unknown) => { success: boolean } },
  value: unknown,
) => schema.safeParse(value).success;
const AT = "2026-10-14T13:00:00.000Z";

const executedRun = (overrides: Record<string, unknown> = {}) => ({
  id: uuid(1),
  questionId: uuid(2),
  status: "COMPLETED",
  failureReason: null,
  outcome: "EXECUTED",
  sourceCode: "print(input())",
  compileOutput: null,
  publicCaseCount: 2,
  passedCount: 1,
  createdAt: AT,
  finishedAt: AT,
  contentPurged: false,
  cases: [
    {
      position: 0,
      verdict: "PASSED",
      stdout: "1\n",
      stderr: "",
      durationMs: 120,
    },
    {
      position: 1,
      verdict: "WRONG_OUTPUT",
      stdout: "2\n",
      stderr: "",
      durationMs: 98,
    },
  ],
  ...overrides,
});

describe("019 contratos do Code Runner (contracts/http-api.md)", () => {
  it("019 constantes: 64 KB de código, 20 casos, consulta a cada 1 s; três perfis de execução", () => {
    expect(CODE_RUN_MAX_SOURCE_BYTES).toBe(65_536);
    expect(TEST_CASES_MAX).toBe(20);
    expect(CODE_RUN_POLL_MS).toBe(1000);
    expect(ExecutionKeySchema.options).toEqual([
      "java",
      "python",
      "javascript",
    ]);
    expect(QuestionExecutionStatusSchema.options).toEqual([
      "AVAILABLE",
      "UNAVAILABLE",
      "NO_PUBLIC_CASES",
      "NOT_SUPPORTED",
    ]);
  });

  it("019 utf8ByteLength conta como o UTF-8 (acentos 2 bytes, emoji 4, surrogate solto 3)", () => {
    for (const value of [
      "",
      "abc",
      "ação",
      "€",
      "😀",
      "x\uD800y",
      "\uDC00",
      "ç😀ã\n\t",
    ]) {
      expect(utf8ByteLength(value), JSON.stringify(value)).toBe(
        new TextEncoder().encode(value).length,
      );
    }
  });

  it("019 corpo do POST: estrito, código vazio aceito, limite em bytes UTF-8 (acentos contam 2)", () => {
    expect(accepts(CreateCodeRunRequestSchema, { sourceCode: "" })).toBe(true);
    expect(
      accepts(CreateCodeRunRequestSchema, {
        sourceCode: "a".repeat(CODE_RUN_MAX_SOURCE_BYTES),
      }),
    ).toBe(true);
    expect(
      accepts(CreateCodeRunRequestSchema, {
        sourceCode: "a".repeat(CODE_RUN_MAX_SOURCE_BYTES + 1),
      }),
    ).toBe(false);
    // 32 768 "ç" = 65 536 bytes; one more character passes the byte limit with far fewer characters.
    expect(
      accepts(CreateCodeRunRequestSchema, { sourceCode: "ç".repeat(32_768) }),
    ).toBe(true);
    expect(
      accepts(CreateCodeRunRequestSchema, {
        sourceCode: `${"ç".repeat(32_768)}a`,
      }),
    ).toBe(false);
    expect(accepts(CreateCodeRunRequestSchema, {})).toBe(false);
    expect(accepts(CreateCodeRunRequestSchema, { sourceCode: 1 })).toBe(false);
    for (const field of [
      "questionId",
      "language",
      "stdin",
      "status",
      "testCases",
    ]) {
      expect(
        accepts(CreateCodeRunRequestSchema, { sourceCode: "x", [field]: "y" }),
        field,
      ).toBe(false);
    }
  });

  it("019/FR-007 CodeRun: execução concluída, erro de compilação, pendente, falha e conteúdo expurgado", () => {
    expect(accepts(CodeRunSchema, executedRun())).toBe(true);
    expect(
      accepts(
        CodeRunSchema,
        executedRun({
          outcome: "COMPILATION_ERROR",
          compileOutput: "Main.java:1: error",
          passedCount: 0,
          cases: [],
        }),
      ),
    ).toBe(true);
    expect(
      accepts(
        CodeRunSchema,
        executedRun({
          status: "QUEUED",
          outcome: null,
          passedCount: null,
          finishedAt: null,
          cases: [],
        }),
      ),
    ).toBe(true);
    expect(
      accepts(
        CodeRunSchema,
        executedRun({
          status: "FAILED",
          failureReason: "SANDBOX_ERROR",
          outcome: null,
          passedCount: null,
          cases: [],
        }),
      ),
    ).toBe(true);
    const purged = executedRun({
      sourceCode: null,
      contentPurged: true,
      cases: [
        {
          position: 0,
          verdict: "PASSED",
          stdout: null,
          stderr: null,
          durationMs: 120,
        },
      ],
    });
    expect(accepts(CodeRunSchema, purged)).toBe(true);
    expect(accepts(LatestCodeRunSchema, { run: null })).toBe(true);
    expect(accepts(LatestCodeRunSchema, { run: executedRun() })).toBe(true);
    expect(
      accepts(
        CodeRunSchema,
        executedRun({
          cases: [
            {
              position: 0,
              verdict: "ACCEPTED",
              stdout: "",
              stderr: "",
              durationMs: 1,
            },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      accepts(
        CodeRunSchema,
        executedRun({
          cases: [
            {
              position: TEST_CASES_MAX,
              verdict: "PASSED",
              stdout: "",
              stderr: "",
              durationMs: 1,
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("019/FR-004 019/SC-002 CodeRun não tem caso privado, id de caso, contagem de privados, worker, token nem lease", () => {
    const leaks: Array<[string, unknown]> = [
      ["privateCaseCount", 3],
      ["testCaseCount", 5],
      ["privateCases", []],
      ["claimedBy", "worker-1"],
      ["claimToken", uuid(9)],
      ["leaseUntil", AT],
      ["workerId", "worker-1"],
      ["attemptId", uuid(3)],
      ["studentUserId", uuid(4)],
    ];
    for (const [field, value] of leaks)
      expect(
        accepts(CodeRunSchema, executedRun({ [field]: value })),
        field,
      ).toBe(false);
    for (const field of [
      "id",
      "testCaseId",
      "input",
      "expectedOutput",
      "visibility",
    ]) {
      const cases = [
        {
          position: 0,
          verdict: "PASSED",
          stdout: "",
          stderr: "",
          durationMs: 1,
          [field]: field === "id" || field === "testCaseId" ? uuid(5) : "x",
        },
      ];
      expect(accepts(CodeRunSchema, executedRun({ cases })), field).toBe(false);
    }
  });

  it("019/FR-014 019/FR-020 QuestionExecution: situação, versão do worker, convenção por chave e limites", () => {
    const available = {
      status: "AVAILABLE",
      languageVersion: "Python 3.13",
      convention: "STDIN_STDOUT",
      limits: { timeMs: 2000, memoryMb: 256, outputBytes: 65_536 },
    };
    expect(accepts(QuestionExecutionSchema, available)).toBe(true);
    expect(
      accepts(QuestionExecutionSchema, {
        ...available,
        convention: "JAVA_MAIN_CLASS",
      }),
    ).toBe(true);
    expect(
      accepts(QuestionExecutionSchema, {
        status: "UNAVAILABLE",
        languageVersion: null,
        convention: "STDIN_STDOUT",
        limits: null,
      }),
    ).toBe(true);
    expect(
      accepts(QuestionExecutionSchema, {
        status: "NOT_SUPPORTED",
        languageVersion: null,
        convention: null,
        limits: null,
      }),
    ).toBe(true);
    expect(
      accepts(QuestionExecutionSchema, {
        ...available,
        convention: "A classe deve se chamar Main",
      }),
    ).toBe(false);
    expect(
      accepts(QuestionExecutionSchema, { ...available, publicCaseCount: 2 }),
    ).toBe(false);
    expect(
      accepts(QuestionExecutionSchema, {
        ...available,
        limits: { ...available.limits, pids: 128 },
      }),
    ).toBe(false);
  });

  it("019 409 CODE_RUN_NOT_AVAILABLE leva details.reason NO_PUBLIC_CASES ou NOT_SUPPORTED, e nada mais", () => {
    for (const reason of CodeRunUnavailableReasonSchema.options) {
      expect(
        accepts(ErrorBodySchema, {
          statusCode: 409,
          code: "CODE_RUN_NOT_AVAILABLE",
          message: "x",
          details: { reason },
        }),
      ).toBe(true);
    }
    expect(
      accepts(ErrorBodySchema, {
        statusCode: 409,
        code: "CODE_RUN_NOT_AVAILABLE",
        message: "x",
        details: { reason: "UNAVAILABLE" },
      }),
    ).toBe(false);
    expect(
      accepts(ErrorBodySchema, {
        statusCode: 409,
        code: "CODE_RUN_NOT_AVAILABLE",
        message: "x",
        details: { reason: "NO_PUBLIC_CASES", count: 1 },
      }),
    ).toBe(false);
    for (const code of [
      "CODE_RUNNER_UNAVAILABLE",
      "SOURCE_TOO_LARGE",
      "ATTEMPT_NOT_IN_PROGRESS",
    ]) {
      expect(
        accepts(ErrorBodySchema, { statusCode: 409, code, message: "x" }),
        code,
      ).toBe(true);
    }
  });

  it("019/FR-001 422 EXERCISE_RULES aponta exercício, campo e regra, sem texto do exercício", () => {
    const body = (violations: unknown) => ({
      statusCode: 422,
      code: "EXERCISE_RULES",
      message: "x",
      details: { violations },
    });
    expect(
      accepts(
        ErrorBodySchema,
        body([
          { position: 0, field: "testCases", reason: "TEST_CASES_NOT_ALLOWED" },
          {
            position: 2,
            field: "testCases.3.expectedOutput",
            reason: "TEST_CASE_EXPECTED_OUTPUT",
          },
        ]),
      ),
    ).toBe(true);
    expect(accepts(ErrorBodySchema, body([]))).toBe(false);
    expect(
      accepts(
        ErrorBodySchema,
        body([
          {
            position: 0,
            field: "testCases",
            reason: "TEST_CASES_NOT_ALLOWED",
            expectedOutput: "42",
          },
        ]),
      ),
    ).toBe(false);
    expect(
      accepts(
        ErrorBodySchema,
        body([
          {
            position: 0,
            field: "saída esperada",
            reason: "TEST_CASE_EXPECTED_OUTPUT",
          },
        ]),
      ),
    ).toBe(false);
    expect(
      accepts(
        ErrorBodySchema,
        body([{ position: 0, field: "testCases", reason: "faltou a saída" }]),
      ),
    ).toBe(false);
  });
});

describe("021 Code Runner nos Trabalhos (contracts/http-api.md, research Y10)", () => {
  const common = {
    idempotencyKey: uuid(99),
    title: "Atividade",
    publishAt: null,
    acknowledgeOutOfScope: false,
  };
  const assignment = (overrides: Record<string, unknown> = {}) => ({
    ...common,
    source: { type: "ASSIGNMENT", workId: uuid(5) },
    deadline: "2026-10-10T23:59:00.000Z",
    latePolicy: "REJECT",
    ...overrides,
  });
  const exercise = {
    ...common,
    source: { type: "EXERCISE", exerciseIds: [uuid(1)] },
  };
  const exam = {
    ...common,
    source: { type: "EXAM", examId: uuid(6) },
    durationMinutes: 60,
  };

  it("021/FR-001 o Trabalho aceita a opção de executar, desligada por padrão", () => {
    expect(CreateAssignmentRequestSchema.parse(assignment())).toMatchObject({
      codeExecution: false,
    });
    expect(
      CreateActivityRequestSchema.parse(assignment({ codeExecution: true })),
    ).toMatchObject({ codeExecution: true });
    expect(
      accepts(
        CreateAssignmentRequestSchema,
        assignment({ codeExecution: "sim" }),
      ),
    ).toBe(false);
  });

  it("021/FR-003 o Exercício e a Prova recusam a opção (corpos estritos)", () => {
    expect(accepts(CreateExerciseActivityRequestSchema, exercise)).toBe(true);
    expect(
      accepts(CreateExerciseActivityRequestSchema, {
        ...exercise,
        codeExecution: true,
      }),
    ).toBe(false);
    expect(
      accepts(CreateExerciseActivityRequestSchema, {
        ...exercise,
        codeExecution: false,
      }),
    ).toBe(false);
    expect(accepts(CreateExamActivityRequestSchema, exam)).toBe(true);
    expect(
      accepts(CreateExamActivityRequestSchema, {
        ...exam,
        codeExecution: true,
      }),
    ).toBe(false);
    expect(
      accepts(CreateExamActivityRequestSchema, {
        ...exam,
        codeExecution: false,
      }),
    ).toBe(false);
  });

  it("021/FR-002 a edição aceita a opção como opcional", () => {
    expect(
      UpdateActivityRequestSchema.parse({ version: 1 }),
    ).not.toHaveProperty("codeExecution");
    expect(
      UpdateActivityRequestSchema.parse({ version: 1, codeExecution: true }),
    ).toMatchObject({ codeExecution: true });
    expect(
      accepts(UpdateActivityRequestSchema, { version: 1, codeExecution: null }),
    ).toBe(false);
  });

  it("021/FR-001 o código de erro da opção sem questão elegível existe", () => {
    expect(ErrorCodeSchema.options).toContain("CODE_EXECUTION_NOT_ELIGIBLE");
  });

  it("021 a disponibilidade do executor é só um booleano", () => {
    expect(accepts(CodeRunnerAvailabilitySchema, { available: true })).toBe(
      true,
    );
    expect(
      accepts(CodeRunnerAvailabilitySchema, {
        available: true,
        profiles: ["python"],
      }),
    ).toBe(false);
  });

  const lastFinished = {
    studentUserId: uuid(7),
    status: "COMPLETED",
    failureReason: null,
    outcome: "EXECUTED",
    publicCaseCount: 2,
    passedCount: 1,
    finishedAt: AT,
    cases: [
      { position: 0, verdict: "PASSED" },
      { position: 1, verdict: "WRONG_OUTPUT" },
    ],
  };
  const summary = (last: Record<string, unknown> | null = lastFinished) => ({
    questions: [
      { questionId: uuid(2), runCount: 3, pending: false, lastFinished: last },
    ],
  });

  it("021/FR-012 o resumo das execuções leva contagens, situação e veredictos", () => {
    expect(accepts(AttemptCodeRunSummarySchema, summary())).toBe(true);
    expect(accepts(AttemptCodeRunSummarySchema, summary(null))).toBe(true);
    expect(
      accepts(
        AttemptCodeRunSummarySchema,
        summary({ ...lastFinished, status: "QUEUED" }),
      ),
    ).toBe(false);
    expect(
      accepts(
        AttemptCodeRunSummarySchema,
        summary({
          ...lastFinished,
          status: "FAILED",
          failureReason: "EXPIRED",
          outcome: null,
          passedCount: null,
          cases: [],
        }),
      ),
    ).toBe(true);
    expect(
      accepts(AttemptCodeRunSummarySchema, {
        questions: [{ ...summary().questions[0], runCount: -1 }],
      }),
    ).toBe(false);
    // 023/FR-021: the last run names who ran it.
    const { studentUserId: _runner, ...anonymous } = lastFinished;
    expect(accepts(AttemptCodeRunSummarySchema, summary(anonymous))).toBe(
      false,
    );
  });

  it("021/FR-013 o resumo nunca leva código, entrada, saída, stderr ou mensagem do compilador", () => {
    for (const key of [
      "sourceCode",
      "stdout",
      "stderr",
      "compileOutput",
      "input",
      "expectedOutput",
    ]) {
      expect(
        accepts(
          AttemptCodeRunSummarySchema,
          summary({ ...lastFinished, [key]: "x" }),
        ),
      ).toBe(false);
      expect(
        accepts(
          AttemptCodeRunSummarySchema,
          summary({
            ...lastFinished,
            cases: [{ position: 0, verdict: "PASSED", [key]: "x" }],
          }),
        ),
      ).toBe(false);
      expect(
        accepts(AttemptCodeRunSummarySchema, {
          questions: [{ ...summary().questions[0], [key]: "x" }],
        }),
      ).toBe(false);
    }
  });
});
