import { type ExerciseDifficulty, type ExerciseType, type GeneratedExercise, type GeneratedExerciseBatch } from "@repo/contracts";
import { searchKey } from "../../../platform/text/search-key";
import { checkExercise } from "../../exercises/rules/exercise-rules";
import type { ExerciseGenerationRequestContent } from "./request-content";

/** Why an output can't become a proposal (contracts/exercise-generator.md); a code, never content. */
export class ProposalRejected extends Error {
  override readonly name = "ProposalRejected";

  constructor(readonly reason: string) {
    super(reason);
  }
}

/** Where a generated exercise goes: always the batch's, never the output's (FR-031). */
export interface GeneratedExerciseTarget {
  difficulty: ExerciseDifficulty;
  syllabusItemId?: string;
  languageId?: string;
}

/**
 * The exercise input of a generated one (research X8): topic, difficulty and language from the
 * batch — the output never chooses them (FR-031). The structural rules of manual input apply to
 * it as they are (FR-006).
 */
export function generatedExerciseInput(generated: GeneratedExercise, target: GeneratedExerciseTarget): unknown {
  const common = {
    statement: generated.statement,
    explanation: generated.explanation,
    difficulty: target.difficulty,
    cognitiveObjective: generated.cognitiveObjective,
    syllabusItemId: target.syllabusItemId,
  };
  if (generated.type === "OPEN_ANSWER") return { type: generated.type, ...common, expectedAnswer: generated.expectedAnswer };
  if (generated.type === "MULTIPLE_CHOICE") {
    return { type: generated.type, ...common, alternatives: generated.alternatives, isTrickQuestion: generated.isTrickQuestion };
  }
  return {
    type: generated.type,
    ...common,
    instructions: generated.instructions,
    ...(generated.starterCode === null ? {} : { starterCode: generated.starterCode }),
    expectedSolution: generated.expectedSolution,
    languageId: target.languageId,
  };
}

/**
 * Stands for the batch's language in the pure check: which catalog entry it is is known only in
 * `materialize`, which checks the exercises again with the real one.
 */
const ANY_LANGUAGE_ID = "00000000-0000-4000-8000-000000000000";

/**
 * Checks an output that already passed its schema against the batch's request (010 research X10,
 * FR-029): total, types and count per type, difficulty, trick questions (multiple choice only,
 * exactly the requested number), the code language, the per-type structure of manual input, and
 * no two statements equal after `searchKey`. Pure; the first violation throws
 * `ProposalRejected(reason)` and the whole output is refused (FR-030).
 */
export function validateGeneratedBatch({ exercises }: GeneratedExerciseBatch, request: ExerciseGenerationRequestContent["request"]): void {
  if (exercises.length !== request.total) throw new ProposalRejected("COUNT_MISMATCH");

  for (const type of Object.keys(request.counts) as ExerciseType[]) {
    if (exercises.filter((exercise) => exercise.type === type).length !== request.counts[type]) throw new ProposalRejected("TYPE_MISMATCH");
  }
  if (exercises.some((exercise) => exercise.difficulty !== request.difficulty)) throw new ProposalRejected("DIFFICULTY_MISMATCH");

  const tricks = exercises.filter((exercise) => exercise.type === "MULTIPLE_CHOICE" && exercise.isTrickQuestion).length;
  if (tricks !== request.trickQuestions) throw new ProposalRejected("TRICK_MISMATCH");

  const language = request.language === null ? null : searchKey(request.language);
  if (exercises.some((exercise) => exercise.type === "CODE" && (language === null || searchKey(exercise.language) !== language))) {
    throw new ProposalRejected("LANGUAGE_MISMATCH");
  }

  const target = { difficulty: request.difficulty, languageId: ANY_LANGUAGE_ID };
  if (exercises.some((exercise) => checkExercise(generatedExerciseInput(exercise, target)).input === null)) {
    throw new ProposalRejected("STRUCTURE_INVALID");
  }

  const statements = exercises.map((exercise) => searchKey(exercise.statement));
  if (new Set(statements).size !== statements.length) throw new ProposalRejected("DUPLICATE_STATEMENT");
}
