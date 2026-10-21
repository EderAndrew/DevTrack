import { describe, expect, it } from "vitest";
import { type CaseExecution, caseVerdict, summarizeVerdicts } from "./verdict";

const run = (overrides: Partial<CaseExecution> = {}): CaseExecution => ({
  exitCode: 0,
  stdout: "42\n",
  stderr: "",
  timedOut: false,
  outputExceeded: false,
  oomKilled: false,
  ...overrides,
});

describe("019/FR-012 019/FR-014 veredito de um caso (research B6)", () => {
  it("019/FR-012 saída 0 e saída igual → PASSED, mesmo com saída de erro preenchida; diferente → WRONG_OUTPUT", () => {
    expect(caseVerdict(run(), "42")).toBe("PASSED");
    expect(caseVerdict(run({ stderr: "aviso: variável não usada\n" }), "42")).toBe("PASSED");
    expect(caseVerdict(run({ stdout: "41\n" }), "42")).toBe("WRONG_OUTPUT");
    expect(caseVerdict(run({ stdout: "" }), "42")).toBe("WRONG_OUTPUT");
  });

  it("019/FR-014 limite de tempo vem antes de tudo", () => {
    expect(caseVerdict(run({ timedOut: true, exitCode: 137 }), "42")).toBe("TIME_LIMIT");
    expect(caseVerdict(run({ timedOut: true, exitCode: null, outputExceeded: true, oomKilled: true }), "42")).toBe("TIME_LIMIT");
    expect(caseVerdict(run({ timedOut: true, exitCode: 0 }), "42")).toBe("TIME_LIMIT");
  });

  it("019/FR-014 saída demais vem antes de memória e de erro de execução", () => {
    expect(caseVerdict(run({ outputExceeded: true, exitCode: 137 }), "42")).toBe("OUTPUT_LIMIT");
    expect(caseVerdict(run({ outputExceeded: true, oomKilled: true, exitCode: 137 }), "42")).toBe("OUTPUT_LIMIT");
    expect(caseVerdict(run({ outputExceeded: true, exitCode: 0 }), "42")).toBe("OUTPUT_LIMIT");
  });

  it("019/FR-014 memória: OOMKilled, saída 137 sem tempo esgotado, OutOfMemoryError do Java, heap do Node, MemoryError do Python", () => {
    expect(caseVerdict(run({ oomKilled: true, exitCode: 137 }), "42")).toBe("MEMORY_LIMIT");
    expect(caseVerdict(run({ oomKilled: true, exitCode: 1 }), "42")).toBe("MEMORY_LIMIT");
    expect(caseVerdict(run({ exitCode: 137 }), "42")).toBe("MEMORY_LIMIT");
    expect(
      caseVerdict(run({ exitCode: 1, stderr: 'Exception in thread "main" java.lang.OutOfMemoryError: Java heap space\n\tat Main.main(Main.java:5)\n' }), "42"),
    ).toBe("MEMORY_LIMIT");
    expect(
      caseVerdict(run({ exitCode: 134, stderr: "FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\n" }), "42"),
    ).toBe("MEMORY_LIMIT");
    expect(caseVerdict(run({ exitCode: 1, stderr: "Traceback (most recent call last):\n  File \"/tmp/main.py\", line 1\nMemoryError\n" }), "42")).toBe(
      "MEMORY_LIMIT",
    );
  });

  it("019/FR-014 qualquer outra saída diferente de 0 → RUNTIME_ERROR, também sem código de saída", () => {
    expect(caseVerdict(run({ exitCode: 1, stderr: "Traceback…\nZeroDivisionError: division by zero\n" }), "42")).toBe("RUNTIME_ERROR");
    expect(caseVerdict(run({ exitCode: 2, stdout: "42\n" }), "42")).toBe("RUNTIME_ERROR");
    expect(caseVerdict(run({ exitCode: 139 }), "42")).toBe("RUNTIME_ERROR");
    expect(caseVerdict(run({ exitCode: null }), "42")).toBe("RUNTIME_ERROR");
    // A message that only mentions memory in the program's own output is not a memory verdict.
    expect(caseVerdict(run({ exitCode: 1, stdout: "MemoryError\n" }), "42")).toBe("RUNTIME_ERROR");
  });

  it("019/FR-007 acertos e contagem por veredito de uma execução", () => {
    expect(summarizeVerdicts(["PASSED", "WRONG_OUTPUT", "PASSED", "TIME_LIMIT"])).toEqual({
      passedCount: 2,
      verdicts: { PASSED: 2, WRONG_OUTPUT: 1, RUNTIME_ERROR: 0, TIME_LIMIT: 1, MEMORY_LIMIT: 0, OUTPUT_LIMIT: 0 },
    });
    expect(summarizeVerdicts([])).toEqual({
      passedCount: 0,
      verdicts: { PASSED: 0, WRONG_OUTPUT: 0, RUNTIME_ERROR: 0, TIME_LIMIT: 0, MEMORY_LIMIT: 0, OUTPUT_LIMIT: 0 },
    });
  });
});
