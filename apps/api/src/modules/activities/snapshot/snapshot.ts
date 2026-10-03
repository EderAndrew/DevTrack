import type { GradeCents, TestCaseVisibility, WorkGradingStrategy, WorkQuestionType } from "@repo/contracts";

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
  valueCents: GradeCents;
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
  totalCents: GradeCents;
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
