import type { ExerciseDifficulty, GradeCents, TestCaseVisibility, WorkGradingStrategy, WorkQuestionType } from "@repo/contracts";

/**
 * The content an activity copies from the teacher's banks (research P2): one shape for works and
 * exercises, so grading and the student allowlist exist once. Pure data, written by
 * `write-snapshot.ts` and never changed afterwards (immutability trigger).
 */
export interface SnapshotQuestion {
  /** 0-based, in the teacher's order. */
  position: number;
  type: WorkQuestionType;
  gradingStrategy: WorkGradingStrategy;
  /** ASSIGNMENT only; null for an EXERCISE question (013 K1). */
  valueCents: GradeCents | null;
  /** EXERCISE only: the exercise's difficulty and its fixed points (013 K2); null for ASSIGNMENT. */
  difficulty: ExerciseDifficulty | null;
  points: number | null;
  statement: string;
  instructions: string | null;
  starterCode: string | null;
  languageId: string | null;
  expectedAnswer: string | null;
  rubric: string | null;
  expectedSolution: string | null;
  explanation: string | null;
  isTrickQuestion: boolean;
  sourceExerciseId: string | null;
  alternatives: { position: number; text: string; isCorrect: boolean }[];
  testCases: { position: number; input: string; expectedOutput: string; visibility: TestCaseVisibility }[];
  /** Syllabus items the question assesses (constitution XXIII). */
  topicItemIds: string[];
}

export interface ActivitySnapshot {
  /** ASSIGNMENT only: the work's grade; null for EXERCISE (013 K1). */
  totalCents: GradeCents | null;
  questions: SnapshotQuestion[];
}

/** Every syllabus item of the snapshot with the positions of the questions that assess it. */
export function topicPositions(questions: readonly SnapshotQuestion[]): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  for (const question of questions) {
    for (const itemId of question.topicItemIds) positions.set(itemId, [...(positions.get(itemId) ?? []), question.position]);
  }
  return positions;
}
