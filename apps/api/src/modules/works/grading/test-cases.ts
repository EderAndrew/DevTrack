import type { PendingReason } from "@repo/contracts";
import { answerOf, type CodeRunStatus, type GradingStrategy, pendingTeacher, ruleResult } from "./strategy";

const PENDING: Partial<Record<CodeRunStatus, PendingReason>> = {
  UNAVAILABLE: "CODE_RUNNER_UNAVAILABLE",
  INFRA_ERROR: "CODE_RUNNER_INFRA_ERROR",
};

/**
 * `TEST_CASES` (011/FR-038): the Code Runner runs every test case on the student's code — all
 * passed, the value; any failed, 0. It gets the language, the code and the test cases, never the
 * expected solution. Unavailable, an infrastructure error or no test case → the teacher (FR-040).
 */
export const testCases: GradingStrategy<"TEST_CASES"> = {
  key: "TEST_CASES",
  grade: async (question, answer, { codeRunner }) => {
    const { source } = answerOf(answer, "CODE");
    if (question.testCases.length === 0) return pendingTeacher(question, "NO_TEST_CASES");
    const { status } = await codeRunner.run({
      languageKey: question.languageKey,
      source,
      testCases: question.testCases.map(({ input, expectedOutput }) => ({ input, expectedOutput })),
    });
    const reason = PENDING[status];
    if (reason) return pendingTeacher(question, reason);
    return ruleResult(question, status === "PASSED" ? question.valueCents : 0);
  },
};
