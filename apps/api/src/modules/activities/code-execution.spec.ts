import { describe, expect, it } from "vitest";
import { codeExecutionEligible, type CodeExecutionQuestion } from "./code-execution";

const PUBLIC = { visibility: "PUBLIC" as const };
const PRIVATE = { visibility: "PRIVATE" as const };
const code = (execution: CodeExecutionQuestion["language"], testCases: CodeExecutionQuestion["testCases"]): CodeExecutionQuestion => ({
  type: "CODE",
  language: execution,
  testCases,
});
const multipleChoice: CodeExecutionQuestion = { type: "MULTIPLE_CHOICE", language: null, testCases: [] };
const openAnswer: CodeExecutionQuestion = { type: "OPEN_ANSWER", language: null, testCases: [] };

describe("021/FR-001 codeExecutionEligible (research Y2)", () => {
  it("sem questão de Código → não elegível", () => {
    expect(codeExecutionEligible([multipleChoice, openAnswer])).toBe(false);
    expect(codeExecutionEligible([])).toBe(false);
  });

  it("Código só com casos PRIVATE ou sem casos → não elegível", () => {
    expect(codeExecutionEligible([code({ execution: "python" }, [PRIVATE, PRIVATE])])).toBe(false);
    expect(codeExecutionEligible([code({ execution: "python" }, [])])).toBe(false);
  });

  it("Código numa linguagem sem execução (C++) ou sem linguagem → não elegível", () => {
    expect(codeExecutionEligible([code({ execution: null }, [PUBLIC])])).toBe(false);
    expect(codeExecutionEligible([code(null, [PUBLIC])])).toBe(false);
  });

  it("Código de Python com um caso PUBLIC → elegível", () => {
    expect(codeExecutionEligible([code({ execution: "python" }, [PRIVATE, PUBLIC])])).toBe(true);
  });

  it("mistura: basta uma questão de Código executável entre as outras", () => {
    expect(
      codeExecutionEligible([multipleChoice, code({ execution: null }, [PUBLIC]), code({ execution: "java" }, [PRIVATE]), code({ execution: "javascript" }, [PUBLIC]), openAnswer]),
    ).toBe(true);
    expect(codeExecutionEligible([multipleChoice, code({ execution: null }, [PUBLIC]), code({ execution: "java" }, [PRIVATE])])).toBe(false);
  });
});
