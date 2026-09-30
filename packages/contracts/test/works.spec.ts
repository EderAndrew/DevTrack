import { describe, expect, it } from "vitest";
import {
  AiModelTierSchema,
  ExerciseDifficultySchema,
  TestCaseVisibilitySchema,
  WorkDifficultySchema,
  WorkGenerationRequestStatusSchema,
  WorkGradingStrategySchema,
  WorkOriginSchema,
  WorkQuestionTypeSchema,
  WorkStatusSchema,
} from "../src/index.js";

describe("011 enums do banco de trabalhos", () => {
  it("têm exatamente os valores do data-model", () => {
    expect(WorkQuestionTypeSchema.options).toEqual(["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"]);
    expect(WorkGradingStrategySchema.options).toEqual(["EXACT_MATCH", "TEST_CASES", "AI_REVIEW"]);
    expect(WorkDifficultySchema.options).toEqual(["BASIC", "INTERMEDIATE", "ADVANCED"]);
    expect(WorkOriginSchema.options).toEqual(["MANUAL", "AI_GENERATED"]);
    expect(WorkStatusSchema.options).toEqual(["DRAFT", "APPROVED", "ARCHIVED"]);
    expect(TestCaseVisibilitySchema.options).toEqual(["PUBLIC", "PRIVATE"]);
    expect(WorkGenerationRequestStatusSchema.options).toEqual(["PENDING", "GENERATED", "FAILED", "CANCELLED"]);
  });

  it("011/FR-009 a dificuldade do trabalho é um enum próprio, sem reaproveitar o da 010 nem o tier de IA", () => {
    expect(WorkDifficultySchema).not.toBe(ExerciseDifficultySchema);
    expect(WorkDifficultySchema).not.toBe(AiModelTierSchema);
    expect(WorkDifficultySchema.safeParse("ADVANCED").success).toBe(true);
    for (const tier of AiModelTierSchema.options) {
      if (!WorkDifficultySchema.options.includes(tier as never)) expect(WorkDifficultySchema.safeParse(tier).success).toBe(false);
    }
  });
});
