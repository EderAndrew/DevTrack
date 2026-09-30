import { type GeneratedWorkQuestion, GeneratedWorkSchema } from "@repo/contracts";
import type { ProposalBuildContext } from "../../ai/definitions/types";
import { ProposalRejected } from "./proposal-rejected";
import { READ_WORK_GENERATION_REQUEST, WorkGenerationRequestContentSchema } from "./request-content";
import { validateGeneratedWork } from "./validate-generated-work";

/**
 * The payload of a `WORK_GENERATION` proposal: the generated questions in output order, still
 * citing topics by ref. `materialize` maps each ref to the request's item at that position (the
 * model never sees an item id, research W12).
 */
export interface WorkGenerationContent {
  questions: GeneratedWorkQuestion[];
}

/** The proposal item id of the question at `index` (the review compares what remains of them). */
export const workQuestionItemId = (index: number) => `question:${index}`;

/**
 * `proposal.build` of `work-generator` (011 research W10): pure, from the output that passed its
 * strict schema and the request the read tool returned. The questions are checked against that
 * request before any write (research W13); `materialize` checks them again with the request's own
 * rows.
 */
export function buildWorkProposal(output: unknown, { toolResults }: ProposalBuildContext): { content: WorkGenerationContent; itemIds: string[] } {
  const read = toolResults.findLast((result) => result.toolKey === READ_WORK_GENERATION_REQUEST);
  if (!read) throw new ProposalRejected("MISSING_REQUEST");
  const request = WorkGenerationRequestContentSchema.parse(read.output);
  const work = GeneratedWorkSchema.parse(output);
  validateGeneratedWork(work, request);
  const { questions } = work;
  return { content: { questions }, itemIds: questions.map((_, index) => workQuestionItemId(index)) };
}
