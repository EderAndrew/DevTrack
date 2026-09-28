import { type GeneratedExercise, GeneratedExerciseBatchSchema } from "@repo/contracts";
import type { ProposalBuildContext } from "../../ai/definitions/types";
import { ExerciseGenerationRequestContentSchema, READ_EXERCISE_GENERATION_REQUEST } from "./request-content";
import { ProposalRejected, validateGeneratedBatch } from "./validate-generated-batch";

/** The payload of an `EXERCISE_GENERATION` proposal: the generated exercises, in output order. */
export interface ExerciseGenerationContent {
  exercises: GeneratedExercise[];
}

/** The item id of the exercise at `index` (the review decides per exercise). */
export const exerciseItemId = (index: number) => `exercise:${index}`;

/**
 * `proposal.build` of `exercise-generator` (010 research X8): pure, from the validated output and
 * the request the read tool returned. The exercises are checked against that request before any
 * write (research X10); `materialize` checks them again with the batch's topic and language.
 */
export function buildExerciseProposal(output: unknown, { toolResults }: ProposalBuildContext): { content: ExerciseGenerationContent; itemIds: string[] } {
  const read = toolResults.findLast((result) => result.toolKey === READ_EXERCISE_GENERATION_REQUEST);
  if (!read) throw new ProposalRejected("MISSING_REQUEST");
  const { request } = ExerciseGenerationRequestContentSchema.parse(read.output);
  const batch = GeneratedExerciseBatchSchema.parse(output);
  validateGeneratedBatch(batch, request);
  const { exercises } = batch;
  return { content: { exercises }, itemIds: exercises.map((_, index) => exerciseItemId(index)) };
}
