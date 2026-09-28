import { describe, expect, it } from "vitest";
import {
  AiModelTierSchema,
  CognitiveObjectiveSchema,
  ExerciseBatchStatusSchema,
  ExerciseDifficultySchema,
  ExerciseOriginSchema,
  ExerciseStatusSchema,
  ExerciseTypeSchema,
} from "../src/index.js";

describe("010 contratos do banco de exercícios", () => {
  it("010/FR-001 010/FR-008 010/FR-009 010/FR-010 vocabulário da plataforma: tipos, objetivos, origem e situações", () => {
    expect(ExerciseTypeSchema.options).toEqual(["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"]);
    expect(CognitiveObjectiveSchema.options).toEqual(["RECOGNIZE", "UNDERSTAND", "APPLY", "ANALYZE", "CREATE"]);
    expect(ExerciseOriginSchema.options).toEqual(["MANUAL", "AI_GENERATED"]);
    expect(ExerciseStatusSchema.options).toEqual(["DRAFT", "APPROVED", "ARCHIVED"]);
    expect(ExerciseBatchStatusSchema.options).toEqual(["PENDING", "GENERATED", "FAILED", "CANCELLED"]);
  });

  it("010/FR-007 a dificuldade pedagógica é um tipo próprio, sem equivalência com o nível de capacidade de IA", () => {
    expect(ExerciseDifficultySchema.options).toEqual(["BASIC", "INTERMEDIATE", "ADVANCED"]);
    // Different sets on purpose: INTERMEDIATE is not a model tier and STANDARD is not a difficulty.
    expect(ExerciseDifficultySchema.safeParse("STANDARD").success).toBe(false);
    expect(AiModelTierSchema.safeParse("INTERMEDIATE").success).toBe(false);
    expect(ExerciseDifficultySchema).not.toBe(AiModelTierSchema);
  });
});
