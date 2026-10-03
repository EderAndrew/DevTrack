import type { GradeCents, TestCaseVisibility, WorkGradingStrategy, WorkQuestionType } from "@repo/contracts";
import type { ActivitySnapshot } from "./snapshot";

/** A work of the bank as the snapshot reads it, grades already in hundredths. */
export interface WorkSource {
  totalCents: GradeCents;
  questions: {
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
    alternatives: { position: number; text: string; isCorrect: boolean }[];
    testCases: { position: number; input: string; expectedOutput: string; visibility: TestCaseVisibility }[];
    topicItemIds: string[];
  }[];
}

/**
 * An ASSIGNMENT copies its work field by field: values, strategies, answer key, test cases and the
 * questions' topics (research P2). Positions become contiguous from 0 in the work's order.
 */
export function snapshotFromWork(work: WorkSource): ActivitySnapshot {
  const ordered = [...work.questions].sort((a, b) => a.position - b.position);
  return {
    totalCents: work.totalCents,
    questions: ordered.map((question, position) => ({
      position,
      type: question.type,
      gradingStrategy: question.gradingStrategy,
      valueCents: question.valueCents,
      statement: question.statement,
      instructions: question.instructions,
      starterCode: question.starterCode,
      languageId: question.languageId,
      expectedAnswer: question.expectedAnswer,
      rubric: question.rubric,
      expectedSolution: question.expectedSolution,
      explanation: question.explanation,
      isTrickQuestion: question.isTrickQuestion,
      sourceExerciseId: null,
      alternatives: [...question.alternatives].sort((a, b) => a.position - b.position).map((alternative, index) => ({ ...alternative, position: index })),
      testCases: [...question.testCases].sort((a, b) => a.position - b.position).map((testCase, index) => ({ ...testCase, position: index })),
      topicItemIds: [...question.topicItemIds],
    })),
  };
}
