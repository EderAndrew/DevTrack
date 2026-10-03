import { distributeGrade, type GradeCents, type WorkQuestionType } from "@repo/contracts";
import { gradingStrategyOf } from "../../works/types";
import type { ActivitySnapshot } from "./snapshot";

/** An exercise of the bank as the snapshot reads it. */
export interface ExerciseSource {
  id: string;
  type: WorkQuestionType;
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
}

/**
 * An EXERCISE activity copies 1–10 exercises in the teacher's order (research P2, P6): each becomes
 * a question of the same type with the type's strategy (011 `gradingStrategyOf`) — so a code
 * exercise, which has no test cases, goes to the teacher (`NO_TEST_CASES`) — and the total grade
 * the teacher chose is split by position with the 011 arithmetic (0,34 · 0,33 · 0,33).
 */
export function snapshotFromExercises(exercises: readonly ExerciseSource[], totalCents: GradeCents): ActivitySnapshot {
  const values = distributeGrade(totalCents, exercises.length);
  return {
    totalCents,
    questions: exercises.map((exercise, position) => ({
      position,
      type: exercise.type,
      gradingStrategy: gradingStrategyOf(exercise.type),
      valueCents: values[position]!,
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
      testCases: [],
      topicItemIds: exercise.syllabusItemId ? [exercise.syllabusItemId] : [],
    })),
  };
}
