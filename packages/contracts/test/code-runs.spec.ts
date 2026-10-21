import { describe, expect, it } from "vitest";
import {
  CODE_RUN_MAX_SOURCE_BYTES,
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

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;
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
    { position: 0, verdict: "PASSED", stdout: "1\n", stderr: "", durationMs: 120 },
    { position: 1, verdict: "WRONG_OUTPUT", stdout: "2\n", stderr: "", durationMs: 98 },
  ],
  ...overrides,
});

describe("019 contratos do Code Runner (contracts/http-api.md)", () => {
  it("019 constantes: 64 KB de código, 20 casos, consulta a cada 1 s; três perfis de execução", () => {
    expect(CODE_RUN_MAX_SOURCE_BYTES).toBe(65_536);
    expect(TEST_CASES_MAX).toBe(20);
    expect(CODE_RUN_POLL_MS).toBe(1000);
    expect(ExecutionKeySchema.options).toEqual(["java", "python", "javascript"]);
    expect(QuestionExecutionStatusSchema.options).toEqual(["AVAILABLE", "UNAVAILABLE", "NO_PUBLIC_CASES", "NOT_SUPPORTED"]);
  });

  it("019 utf8ByteLength conta como o UTF-8 (acentos 2 bytes, emoji 4, surrogate solto 3)", () => {
    for (const value of ["", "abc", "ação", "€", "😀", "x\uD800y", "\uDC00", "ç😀ã\n\t"]) {
      expect(utf8ByteLength(value), JSON.stringify(value)).toBe(new TextEncoder().encode(value).length);
    }
  });

  it("019 corpo do POST: estrito, código vazio aceito, limite em bytes UTF-8 (acentos contam 2)", () => {
    expect(accepts(CreateCodeRunRequestSchema, { sourceCode: "" })).toBe(true);
    expect(accepts(CreateCodeRunRequestSchema, { sourceCode: "a".repeat(CODE_RUN_MAX_SOURCE_BYTES) })).toBe(true);
    expect(accepts(CreateCodeRunRequestSchema, { sourceCode: "a".repeat(CODE_RUN_MAX_SOURCE_BYTES + 1) })).toBe(false);
    // 32 768 "ç" = 65 536 bytes; one more character passes the byte limit with far fewer characters.
    expect(accepts(CreateCodeRunRequestSchema, { sourceCode: "ç".repeat(32_768) })).toBe(true);
    expect(accepts(CreateCodeRunRequestSchema, { sourceCode: `${"ç".repeat(32_768)}a` })).toBe(false);
    expect(accepts(CreateCodeRunRequestSchema, {})).toBe(false);
    expect(accepts(CreateCodeRunRequestSchema, { sourceCode: 1 })).toBe(false);
    for (const field of ["questionId", "language", "stdin", "status", "testCases"]) {
      expect(accepts(CreateCodeRunRequestSchema, { sourceCode: "x", [field]: "y" }), field).toBe(false);
    }
  });

  it("019/FR-007 CodeRun: execução concluída, erro de compilação, pendente, falha e conteúdo expurgado", () => {
    expect(accepts(CodeRunSchema, executedRun())).toBe(true);
    expect(
      accepts(CodeRunSchema, executedRun({ outcome: "COMPILATION_ERROR", compileOutput: "Main.java:1: error", passedCount: 0, cases: [] })),
    ).toBe(true);
    expect(accepts(CodeRunSchema, executedRun({ status: "QUEUED", outcome: null, passedCount: null, finishedAt: null, cases: [] }))).toBe(true);
    expect(
      accepts(CodeRunSchema, executedRun({ status: "FAILED", failureReason: "SANDBOX_ERROR", outcome: null, passedCount: null, cases: [] })),
    ).toBe(true);
    const purged = executedRun({
      sourceCode: null,
      contentPurged: true,
      cases: [{ position: 0, verdict: "PASSED", stdout: null, stderr: null, durationMs: 120 }],
    });
    expect(accepts(CodeRunSchema, purged)).toBe(true);
    expect(accepts(LatestCodeRunSchema, { run: null })).toBe(true);
    expect(accepts(LatestCodeRunSchema, { run: executedRun() })).toBe(true);
    expect(accepts(CodeRunSchema, executedRun({ cases: [{ position: 0, verdict: "ACCEPTED", stdout: "", stderr: "", durationMs: 1 }] }))).toBe(false);
    expect(accepts(CodeRunSchema, executedRun({ cases: [{ position: TEST_CASES_MAX, verdict: "PASSED", stdout: "", stderr: "", durationMs: 1 }] }))).toBe(false);
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
    for (const [field, value] of leaks) expect(accepts(CodeRunSchema, executedRun({ [field]: value })), field).toBe(false);
    for (const field of ["id", "testCaseId", "input", "expectedOutput", "visibility"]) {
      const cases = [{ position: 0, verdict: "PASSED", stdout: "", stderr: "", durationMs: 1, [field]: field === "id" || field === "testCaseId" ? uuid(5) : "x" }];
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
    expect(accepts(QuestionExecutionSchema, { ...available, convention: "JAVA_MAIN_CLASS" })).toBe(true);
    expect(accepts(QuestionExecutionSchema, { status: "UNAVAILABLE", languageVersion: null, convention: "STDIN_STDOUT", limits: null })).toBe(true);
    expect(accepts(QuestionExecutionSchema, { status: "NOT_SUPPORTED", languageVersion: null, convention: null, limits: null })).toBe(true);
    expect(accepts(QuestionExecutionSchema, { ...available, convention: "A classe deve se chamar Main" })).toBe(false);
    expect(accepts(QuestionExecutionSchema, { ...available, publicCaseCount: 2 })).toBe(false);
    expect(accepts(QuestionExecutionSchema, { ...available, limits: { ...available.limits, pids: 128 } })).toBe(false);
  });

  it("019 409 CODE_RUN_NOT_AVAILABLE leva details.reason NO_PUBLIC_CASES ou NOT_SUPPORTED, e nada mais", () => {
    for (const reason of CodeRunUnavailableReasonSchema.options) {
      expect(accepts(ErrorBodySchema, { statusCode: 409, code: "CODE_RUN_NOT_AVAILABLE", message: "x", details: { reason } })).toBe(true);
    }
    expect(accepts(ErrorBodySchema, { statusCode: 409, code: "CODE_RUN_NOT_AVAILABLE", message: "x", details: { reason: "UNAVAILABLE" } })).toBe(false);
    expect(
      accepts(ErrorBodySchema, { statusCode: 409, code: "CODE_RUN_NOT_AVAILABLE", message: "x", details: { reason: "NO_PUBLIC_CASES", count: 1 } }),
    ).toBe(false);
    for (const code of ["CODE_RUNNER_UNAVAILABLE", "SOURCE_TOO_LARGE", "ATTEMPT_NOT_IN_PROGRESS"]) {
      expect(accepts(ErrorBodySchema, { statusCode: 409, code, message: "x" }), code).toBe(true);
    }
  });

  it("019/FR-001 422 EXERCISE_RULES aponta exercício, campo e regra, sem texto do exercício", () => {
    const body = (violations: unknown) => ({ statusCode: 422, code: "EXERCISE_RULES", message: "x", details: { violations } });
    expect(
      accepts(
        ErrorBodySchema,
        body([
          { position: 0, field: "testCases", reason: "TEST_CASES_NOT_ALLOWED" },
          { position: 2, field: "testCases.3.expectedOutput", reason: "TEST_CASE_EXPECTED_OUTPUT" },
        ]),
      ),
    ).toBe(true);
    expect(accepts(ErrorBodySchema, body([]))).toBe(false);
    expect(accepts(ErrorBodySchema, body([{ position: 0, field: "testCases", reason: "TEST_CASES_NOT_ALLOWED", expectedOutput: "42" }]))).toBe(false);
    expect(accepts(ErrorBodySchema, body([{ position: 0, field: "saída esperada", reason: "TEST_CASE_EXPECTED_OUTPUT" }]))).toBe(false);
    expect(accepts(ErrorBodySchema, body([{ position: 0, field: "testCases", reason: "faltou a saída" }]))).toBe(false);
  });
});
