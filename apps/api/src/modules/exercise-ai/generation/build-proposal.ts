import { type GeneratedExercise, GeneratedExerciseBatchSchema } from "@repo/contracts";
import type { ProposalBuildContext } from "../../ai/definitions/types";
import { ExerciseGenerationRequestContentSchema, READ_EXERCISE_GENERATION_REQUEST } from "./request-content";

/** The payload of an `EXERCISE_GENERATION` proposal: the generated exercises, in output order. */
export interface ExerciseGenerationContent {
  exercises: GeneratedExercise[];
}

/** Why an output can't become a proposal (contracts/exercise-generator.md); a code, never content. */
export class ProposalRejected extends Error {
  override readonly name = "ProposalRejected";

  constructor(readonly reason: string) {
    super(reason);
  }
}

/** The item id of the exercise at `index` (the review decides per exercise). */
export const exerciseItemId = (index: number) => `exercise:${index}`;

/**
 * `proposal.build` of `exercise-generator` (010 research X8): pure, from the validated output and
 * the request the read tool returned. The exercises are checked against the batch before any
 * write — the per-type structure in `materialize`, which knows the batch's language.
 */
export function buildExerciseProposal(output: unknown, { toolResults }: ProposalBuildContext): { content: ExerciseGenerationContent; itemIds: string[] } {
  const read = toolResults.findLast((result) => result.toolKey === READ_EXERCISE_GENERATION_REQUEST);
  if (!read) throw new ProposalRejected("MISSING_REQUEST");
  ExerciseGenerationRequestContentSchema.parse(read.output);
  const { exercises } = GeneratedExerciseBatchSchema.parse(output);
  return { content: { exercises }, itemIds: exercises.map((_, index) => exerciseItemId(index)) };
}
