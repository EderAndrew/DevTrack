import { z } from "zod";

// Public enums of the work bank (011 data-model.md). Platform concepts, so fixed in code
// (constitution XXI). None reuses a 010 or AI enum: the two banks evolve apart (research W1).

export const WorkQuestionTypeSchema = z.enum(["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"]);
export type WorkQuestionType = z.infer<typeof WorkQuestionTypeSchema>;

/** How a question is graded (research W7); fixed by its type, a domain rule the 012 grading uses. */
export const WorkGradingStrategySchema = z.enum(["EXACT_MATCH", "TEST_CASES", "AI_REVIEW"]);
export type WorkGradingStrategy = z.infer<typeof WorkGradingStrategySchema>;

/**
 * The pedagogical difficulty of a work (011/FR-009). Unrelated to the AI model tier
 * (`AiModelTierSchema`) and to the exercise difficulty (`ExerciseDifficultySchema`).
 */
export const WorkDifficultySchema = z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]);
export type WorkDifficulty = z.infer<typeof WorkDifficultySchema>;

export const WorkOriginSchema = z.enum(["MANUAL", "AI_GENERATED"]);
export type WorkOrigin = z.infer<typeof WorkOriginSchema>;

export const WorkStatusSchema = z.enum(["DRAFT", "APPROVED", "ARCHIVED"]);
export type WorkStatus = z.infer<typeof WorkStatusSchema>;

/** A PRIVATE test case never reaches the student view. */
export const TestCaseVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);
export type TestCaseVisibility = z.infer<typeof TestCaseVisibilitySchema>;

/** Derived from the request's AI execution and its materialization, never stored twice (data-model.md). */
export const WorkGenerationRequestStatusSchema = z.enum(["PENDING", "GENERATED", "FAILED", "CANCELLED"]);
export type WorkGenerationRequestStatus = z.infer<typeof WorkGenerationRequestStatusSchema>;
