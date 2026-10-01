import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WorkGradingStrategySchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { FakeAiReview, FakeCodeRunner } from "../../../../test/fixtures/works/grading-ports";
import { gradingStrategyOf, WORK_QUESTION_TYPES } from "../types";
import { GRADING_STRATEGIES, gradeQuestion } from "./registry";
import type { GradableQuestion, GradingPorts } from "./strategy";

const ID = "3f8a1c52-6b1e-4c4b-9d0e-2a7f5b9c1d10";
const ports: GradingPorts = {
  codeRunner: new FakeCodeRunner(() => "PASSED"),
  aiReview: new FakeAiReview({ kind: "SUGGESTED", suggestedCents: 2, justification: "j", feedback: "f", confidence: 0.5 }),
};

describe("011/FR-036 o despachante escolhe a estratégia pelo registro, nunca pelo tipo da questão", () => {
  it("há uma estratégia registrada para cada valor de grading_strategy, e cada tipo de questão aponta para uma delas", () => {
    expect(Object.keys(GRADING_STRATEGIES).sort()).toEqual([...WorkGradingStrategySchema.options].sort());
    for (const [key, strategy] of Object.entries(GRADING_STRATEGIES)) expect(strategy.key).toBe(key);
    for (const type of Object.keys(WORK_QUESTION_TYPES) as (keyof typeof WORK_QUESTION_TYPES)[]) {
      expect(GRADING_STRATEGIES[gradingStrategyOf(type)]).toBeDefined();
    }
  });

  it("gradeQuestion entrega cada questão à estratégia do seu grading_strategy", async () => {
    const questions: [GradableQuestion, Parameters<typeof gradeQuestion>[1]][] = [
      [{ strategy: "EXACT_MATCH", id: ID, valueCents: 5, correctAlternativeId: ID }, { kind: "ALTERNATIVE", alternativeId: ID }],
      [{ strategy: "TEST_CASES", id: ID, valueCents: 5, languageKey: "java", testCases: [{ input: "1", expectedOutput: "1" }] }, { kind: "CODE", source: "x" }],
      [{ strategy: "AI_REVIEW", id: ID, valueCents: 5, statement: "S", expectedAnswer: "R", rubric: null }, { kind: "TEXT", text: "t" }],
    ];
    const results = await Promise.all(questions.map(([question, answer]) => gradeQuestion(question, answer, ports)));
    expect(results.map((result) => [result.strategy, result.status, result.finalCents, result.suggestedCents])).toEqual([
      ["EXACT_MATCH", "GRADED", 5, null],
      ["TEST_CASES", "GRADED", 5, null],
      ["AI_REVIEW", "SUGGESTED", null, 2],
    ]);
  });

  it("varredura: o despachante não ramifica por tipo de questão", () => {
    const source = readFileSync(join(__dirname, "registry.ts"), "utf8");
    expect(source).not.toMatch(/\bswitch\b/);
    expect(source).not.toMatch(/\.type\b/);
    for (const type of Object.keys(WORK_QUESTION_TYPES)) expect(source).not.toContain(`"${type}"`);
  });
});
