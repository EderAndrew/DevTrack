import type { ActivityType } from "@repo/contracts";

/**
 * What differs by activity type (research P3), as a registry: a new type (the exams spec's `EXAM`)
 * is a new entry, never a branch spread through the services.
 */
export interface ActivityTypeDefinition {
  /** Where the total grade comes from: the work's own (ASSIGNMENT) or the teacher's request (EXERCISE, Q3 = A). */
  totalGradeSource: "SOURCE" | "REQUEST";
  /** Bank items an activity of this type takes. */
  sourceCount: { min: number; max: number };
}

export const ACTIVITY_TYPES: { readonly [T in ActivityType]: ActivityTypeDefinition } = {
  ASSIGNMENT: { totalGradeSource: "SOURCE", sourceCount: { min: 1, max: 1 } },
  EXERCISE: { totalGradeSource: "REQUEST", sourceCount: { min: 1, max: 10 } },
};
