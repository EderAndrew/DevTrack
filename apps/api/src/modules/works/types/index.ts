import type { WorkGradingStrategy, WorkQuestionType } from "@repo/contracts";
import { CODE } from "./code";
import type { WorkQuestionTypeDefinition } from "./definition";
import { MULTIPLE_CHOICE } from "./multiple-choice";
import { OPEN_ANSWER } from "./open-answer";

export type * from "./definition";
export { byPosition } from "./definition";

/** The question types of a work (011 research W5). The services go through this registry, never a switch. */
export const WORK_QUESTION_TYPES: { readonly [T in WorkQuestionType]: WorkQuestionTypeDefinition<T> } = {
  OPEN_ANSWER,
  MULTIPLE_CHOICE,
  CODE,
};

export function workQuestionType<T extends WorkQuestionType>(type: T): WorkQuestionTypeDefinition<T> {
  return WORK_QUESTION_TYPES[type];
}

/** The strategy a question of `type` is graded by, fixed by the type (research W7, FR-036). */
export function gradingStrategyOf(type: WorkQuestionType): WorkGradingStrategy {
  return WORK_QUESTION_TYPES[type].gradingStrategy;
}
