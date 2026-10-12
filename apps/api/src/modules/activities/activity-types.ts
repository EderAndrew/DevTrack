import type { ActivityType, ReleaseMode } from "@repo/contracts";

/**
 * What differs by activity type (012 research P3, 013 K1), as a registry: a new type (the exams
 * spec's `EXAM`) is a new entry, never a branch spread through the services.
 */
export interface ActivityTypeDefinition {
  /** A grade split in hundredths and released by the teacher (ASSIGNMENT, EXAM), or fixed practice points (EXERCISE). */
  scoring: "GRADE" | "POINTS";
  /**
   * A deadline and a late policy (ASSIGNMENT); an EXERCISE has only its publication date, and an EXAM
   * a duration from each student's start instead (018 research T4).
   */
  hasDeadline: boolean;
  /** One attempt submitted once (ASSIGNMENT), or numbered practice attempts where only the first conclusion scores. */
  attempts: "SINGLE" | "PRACTICE";
  /** Bank items an activity of this type takes. */
  sourceCount: { min: number; max: number };
  /**
   * The 015 options chosen by the teacher: CONTROLLED mode and the AI help (ASSIGNMENT); an EXERCISE is
   * always NORMAL with none (015/FR-002), an EXAM always CONTROLLED with none, set by the server (018 T3).
   */
  workOptions: boolean;
  /**
   * Who a new activity of this type is released to (016 research M2): only the students marked
   * present (ASSIGNMENT, done in class), or every ACTIVE enrollment (EXERCISE, free practice, 016/FR-007).
   */
  releaseMode: ReleaseMode;
}

export const ACTIVITY_TYPES: { readonly [T in ActivityType]: ActivityTypeDefinition } = {
  ASSIGNMENT: { scoring: "GRADE", hasDeadline: true, attempts: "SINGLE", sourceCount: { min: 1, max: 1 }, workOptions: true, releaseMode: "PRESENT_ONLY" },
  EXERCISE: { scoring: "POINTS", hasDeadline: false, attempts: "PRACTICE", sourceCount: { min: 1, max: 10 }, workOptions: false, releaseMode: "ALL_ENROLLED" },
  EXAM: { scoring: "GRADE", hasDeadline: false, attempts: "SINGLE", sourceCount: { min: 1, max: 1 }, workOptions: false, releaseMode: "PRESENT_ONLY" },
};
