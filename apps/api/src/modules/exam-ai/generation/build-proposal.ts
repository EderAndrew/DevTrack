import { type GeneratedExamQuestion, GeneratedExamSchema } from "@repo/contracts";
import type { ProposalBuildContext } from "../../ai/definitions/types";
import { ProposalRejected } from "./proposal-rejected";
import { ExamGenerationRequestContentSchema, READ_EXAM_GENERATION_REQUEST } from "./request-content";
import { validateGeneratedExam } from "./validate-generated-exam";

/** The payload of an `EXAM_GENERATION` proposal: the generated questions in output order. */
export interface ExamGenerationContent {
  questions: GeneratedExamQuestion[];
}

/** The proposal item id of the question at `index` (the review compares what remains of them). */
export const examQuestionItemId = (index: number) => `question:${index}`;

/**
 * `proposal.build` of `exam-generator` (018 research T14): pure, from the output that passed its strict
 * schema and the request the read tool returned. The questions are checked against that request
 * before any write; `materialize` checks them again with the request's own rows.
 */
export function buildExamProposal(output: unknown, { toolResults }: ProposalBuildContext): { content: ExamGenerationContent; itemIds: string[] } {
  const read = toolResults.findLast((result) => result.toolKey === READ_EXAM_GENERATION_REQUEST);
  if (!read) throw new ProposalRejected("MISSING_REQUEST");
  const request = ExamGenerationRequestContentSchema.parse(read.output);
  const exam = GeneratedExamSchema.parse(output);
  validateGeneratedExam(exam, request);
  const { questions } = exam;
  return { content: { questions }, itemIds: questions.map((_, index) => examQuestionItemId(index)) };
}
