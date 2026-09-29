import type { ExerciseType } from "@repo/contracts";
import { CODE } from "./code";
import type { ExerciseTypeDefinition } from "./definition";
import { MULTIPLE_CHOICE } from "./multiple-choice";
import { OPEN_ANSWER } from "./open-answer";

export type * from "./definition";

/** The exercise types (010 research X3). The services go through this registry, never a switch. */
export const EXERCISE_TYPES: { readonly [T in ExerciseType]: ExerciseTypeDefinition<T> } = {
  OPEN_ANSWER,
  MULTIPLE_CHOICE,
  CODE,
};

export function exerciseType<T extends ExerciseType>(type: T): ExerciseTypeDefinition<T> {
  return EXERCISE_TYPES[type];
}
