import { describe, expect, expectTypeOf, it } from "vitest";
import type { CodeRunInput, GradingPorts, TestCasesQuestion } from "./strategy";
import { testCases } from "./test-cases";
import { FakeCodeRunner, NO_PORTS } from "../../../../test/fixtures/works/grading-ports";
import { UnavailableCodeRunner } from "./unavailable-code-runner";

const question = (overrides: Partial<TestCasesQuestion> = {}): TestCasesQuestion => ({
  strategy: "TEST_CASES",
  id: "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10",
  valueCents: 5,
  languageKey: "java",
  testCases: [
    { input: "2 3", expectedOutput: "5" },
    { input: "0 0", expectedOutput: "0" },
  ],
  ...overrides,
});
const ports = (codeRunner: GradingPorts["codeRunner"]): GradingPorts => ({ ...NO_PORTS, codeRunner });

describe("011/FR-038 TEST_CASES: a execução dos casos de teste decide, nunca o texto da solução", () => {
  it("011/US8-3 duas soluções diferentes que passam em todos os casos → valor integral nas duas", async () => {
    const runner = new FakeCodeRunner(() => "PASSED");
    const sources = ["int soma(int a, int b) { return a + b; }", "int soma(int x, int y) { int r = x; r += y; return r; }"];
    for (const source of sources) {
      await expect(testCases.grade(question(), { kind: "CODE", source }, ports(runner))).resolves.toMatchObject({
        status: "GRADED",
        nature: "RULE_RESULT",
        finalCents: 5,
        pendingReason: null,
      });
    }
    // The runner got the language, the student's source and the test cases — and nothing else.
    expect(runner.calls).toEqual(sources.map((source) => ({ languageKey: "java", source, testCases: question().testCases })));
  });

  it("algum caso falhou → 0, resultado da regra", async () => {
    const grading = await testCases.grade(question(), { kind: "CODE", source: "x" }, ports(new FakeCodeRunner(() => "FAILED")));
    expect(grading).toMatchObject({ status: "GRADED", nature: "RULE_RESULT", finalCents: 0 });
  });

  it("011/US8-4 011/FR-040 Code Runner indisponível ou com erro de infraestrutura, ou sem casos de teste → professor, nunca 0", async () => {
    const cases = [
      [new FakeCodeRunner(() => "UNAVAILABLE"), question(), "CODE_RUNNER_UNAVAILABLE"],
      [new FakeCodeRunner(() => "INFRA_ERROR"), question(), "CODE_RUNNER_INFRA_ERROR"],
      [new FakeCodeRunner(() => "PASSED"), question({ testCases: [] }), "NO_TEST_CASES"],
    ] as const;
    for (const [runner, q, reason] of cases) {
      const grading = await testCases.grade(q, { kind: "CODE", source: "x" }, ports(runner));
      expect(grading).toMatchObject({ status: "PENDING_TEACHER", nature: null, finalCents: null, pendingReason: reason });
    }
    // Without test cases there is nothing to run.
    expect(cases[2][0].calls).toEqual([]);
  });

  it("011/FR-042 a 011 só traz o UnavailableCodeRunner: toda questão de código vai para o professor", async () => {
    const grading = await testCases.grade(question(), { kind: "CODE", source: "x" }, ports(new UnavailableCodeRunner()));
    expect(grading).toMatchObject({ status: "PENDING_TEACHER", pendingReason: "CODE_RUNNER_UNAVAILABLE", finalCents: null });
  });

  it("011/FR-038 a entrada da estratégia e a da porta não têm campo de solução esperada (tipo)", () => {
    expectTypeOf<TestCasesQuestion>().not.toHaveProperty("expectedSolution");
    expectTypeOf<CodeRunInput>().not.toHaveProperty("expectedSolution");
    expectTypeOf<CodeRunInput>().toHaveProperty("source");
    const withSolution = {
      ...question(),
      // @ts-expect-error the expected solution is not part of a TEST_CASES question
      expectedSolution: "int soma(int a, int b) { return a + b; }",
    } satisfies TestCasesQuestion;
    expect(withSolution.strategy).toBe("TEST_CASES");
  });

  it("uma resposta que não é código é erro de quem chama", async () => {
    await expect(testCases.grade(question(), { kind: "TEXT", text: "x" }, ports(new UnavailableCodeRunner()))).rejects.toMatchObject({
      code: "ANSWER_KIND_MISMATCH",
    });
  });
});
