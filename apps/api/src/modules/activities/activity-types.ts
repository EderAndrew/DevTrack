import type { ActivityType } from "@repo/contracts";

/**
 * What differs by activity type (012 research P3, 013 K1), as a registry: a new type (the exams
 * spec's `EXAM`) is a new entry, never a branch spread through the services.
 */
export interface ActivityTypeDefinition {
  /** A grade split in hundredths and released by the teacher (ASSIGNMENT), or fixed practice points (EXERCISE). */
  scoring: "GRADE" | "POINTS";
  /** A deadline and a late policy (ASSIGNMENT); an EXERCISE has only its publication date. */
  hasDeadline: boolean;
  /** One attempt submitted once (ASSIGNMENT), or numbered practice attempts where only the first conclusion scores. */
  attempts: "SINGLE" | "PRACTICE";
  /** Bank items an activity of this type takes. */
  sourceCount: { min: number; max: number };
  /** The 015 options: CONTROLLED mode and the AI help (ASSIGNMENT); an EXERCISE is always NORMAL with none (015/FR-002). */
  workOptions: boolean;
}

export const ACTIVITY_TYPES: { readonly [T in ActivityType]: ActivityTypeDefinition } = {
  ASSIGNMENT: { scoring: "GRADE", hasDeadline: true, attempts: "SINGLE", sourceCount: { min: 1, max: 1 }, workOptions: true },
  EXERCISE: { scoring: "POINTS", hasDeadline: false, attempts: "PRACTICE", sourceCount: { min: 1, max: 10 }, workOptions: false },
};
