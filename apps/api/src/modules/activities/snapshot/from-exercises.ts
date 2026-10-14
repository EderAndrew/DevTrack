import { EXERCISE_POINTS, type ExerciseDifficulty, type TestCaseVisibility, type WorkQuestionType } from "@repo/contracts";
import { gradingStrategyOf } from "../../works/types";
import type { ActivitySnapshot } from "./snapshot";

/** An exercise of the bank as the snapshot reads it. */
export interface ExerciseSource {
  id: string;
  type: WorkQuestionType;
  difficulty: ExerciseDifficulty;
  statement: string;
  instructions: string | null;
  starterCode: string | null;
  languageId: string | null;
  expectedAnswer: string | null;
  expectedSolution: string | null;
  explanation: string | null;
  isTrickQuestion: boolean;
  syllabusItemId: string | null;
  alternatives: { position: number; text: string; isCorrect: boolean }[];
  /** 019: the bank exercise's test cases (CODE only), PUBLIC and PRIVATE. */
  testCases: { position: number; input: string; expectedOutput: string; visibility: TestCaseVisibility }[];
}

/**
 * An EXERCISE activity copies 1–10 exercises in the teacher's order (012 research P2, P6): each
 * becomes a question of the same type with the type's strategy (011 `gradingStrategyOf`, used only to
 * tell right from wrong) and, instead of a value, the exercise's difficulty and its fixed points
 * (013 research K2), and a CODE exercise its test cases (019/FR-002, in the bank's order): changing
 * the exercise in the bank later never changes the activity.
 */
export function snapshotFromExercises(exercises: readonly ExerciseSource[]): ActivitySnapshot {
  return {
    totalCents: null,
    questions: exercises.map((exercise, position) => ({
      position,
      type: exercise.type,
      gradingStrategy: gradingStrategyOf(exercise.type),
      valueCents: null,
      difficulty: exercise.difficulty,
      points: EXERCISE_POINTS[exercise.difficulty],
      examDifficulty: null,
      statement: exercise.statement,
      instructions: exercise.type === "CODE" ? exercise.instructions : null,
      starterCode: exercise.type === "CODE" ? exercise.starterCode : null,
      languageId: exercise.type === "CODE" ? exercise.languageId : null,
      expectedAnswer: exercise.type === "OPEN_ANSWER" ? exercise.expectedAnswer : null,
      rubric: null,
      expectedSolution: exercise.type === "CODE" ? exercise.expectedSolution : null,
      explanation: exercise.explanation,
      isTrickQuestion: exercise.isTrickQuestion,
      sourceExerciseId: exercise.id,
      alternatives:
        exercise.type === "MULTIPLE_CHOICE"
          ? [...exercise.alternatives].sort((a, b) => a.position - b.position).map((alternative, index) => ({ ...alternative, position: index }))
          : [],
      testCases:
        exercise.type === "CODE"
          ? [...exercise.testCases].sort((a, b) => a.position - b.position).map((testCase, index) => ({ ...testCase, position: index }))
          : [],
      topicItemIds: exercise.syllabusItemId ? [exercise.syllabusItemId] : [],
    })),
  };
}
