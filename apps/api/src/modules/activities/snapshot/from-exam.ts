import type { GradeCents, TestCaseVisibility, WorkDifficulty, WorkGradingStrategy, WorkQuestionType } from "@repo/contracts";
import type { ActivitySnapshot } from "./snapshot";

/** An approved exam of the Banco de Provas as the snapshot reads it, grades already in hundredths (018 T3). */
export interface ExamSource {
  totalCents: GradeCents;
  /** The exam's topics in its order, with their texts: the rows of the coverage per topic (T15). */
  topics: { syllabusItemId: string; title: string }[];
  questions: {
    position: number;
    type: WorkQuestionType;
    gradingStrategy: WorkGradingStrategy;
    valueCents: GradeCents;
    /** Required on approval (deferred trigger), so set for every question of an applied exam. */
    difficulty: WorkDifficulty | null;
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
 * An EXAM copies its exam as a work is copied (research P2): values, strategies, answer key, test
 * cases and topics, plus each question's difficulty in `examDifficulty` (018 T3). Positions become
 * contiguous from 0 in the exam's order; editing the exam afterwards never reaches the copy (FR-007).
 */
export function snapshotFromExam(exam: ExamSource): ActivitySnapshot {
  const ordered = [...exam.questions].sort((a, b) => a.position - b.position);
  return {
    totalCents: exam.totalCents,
    questions: ordered.map((question, position) => ({
      position,
      type: question.type,
      gradingStrategy: question.gradingStrategy,
      valueCents: question.valueCents,
      difficulty: null,
      points: null,
      examDifficulty: question.difficulty,
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
