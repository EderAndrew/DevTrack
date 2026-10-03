import { z } from "zod";
import type { ExerciseDifficulty } from "../exercises/enums.js";

// Practice points of EXERCISE activities (013 research K2). Points are integers end to end and are
// never a grade (013/FR-013): they don't use the `works` grade helpers.

/** The fixed points of an exercise by its 010 difficulty (013/FR-002). The teacher doesn't set them. */
export const EXERCISE_POINTS: { readonly [D in ExerciseDifficulty]: number } = {
  BASIC: 15,
  INTERMEDIATE: 30,
  ADVANCED: 60,
};

/** A number of points: a non-negative integer. */
export const PointsSchema = z.number().int().nonnegative();
export type Points = z.infer<typeof PointsSchema>;

/** The points an EXERCISE activity can give: the sum of its exercises' points (013/FR-003). */
export function possiblePoints(difficulties: readonly ExerciseDifficulty[]): number {
  return difficulties.reduce((sum, difficulty) => sum + EXERCISE_POINTS[difficulty], 0);
}
