import { type ExamQuestionEdit, ExamQuestionEditSchema, type GeneratedExam, type GeneratedExamQuestion, WorkQuestionTypeSchema } from "@repo/contracts";
import { searchKey } from "../../../platform/text/search-key";
import { examStructureViolations } from "../../exams/exam-rules";
import { ProposalRejected } from "./proposal-rejected";
import type { ExamGenerationRequestContent } from "./request-content";

/**
 * The exam question input of a generated one: the alternatives get their `isCorrect` from
 * `correctIndex`; topics, difficulty and language are the output's, checked against the request by
 * `validateGeneratedExam`. The manual input's schema then applies as it is (018/FR-001).
 */
export function generatedQuestionEdit(generated: GeneratedExamQuestion): unknown {
  const common = { statement: generated.statement, explanation: generated.explanation, difficulty: generated.difficulty, topicIds: generated.topicIds };
  if (generated.type === "OPEN_ANSWER") return { type: generated.type, ...common, expectedAnswer: generated.expectedAnswer, rubric: generated.rubric };
  if (generated.type === "MULTIPLE_CHOICE") {
    return {
      type: generated.type,
      ...common,
      alternatives: generated.alternatives.map((text, index) => ({ text, isCorrect: index === generated.correctIndex })),
      isTrickQuestion: generated.isTrickQuestion,
    };
  }
  return {
    type: generated.type,
    ...common,
    instructions: generated.instructions,
    starterCode: generated.starterCode,
    expectedSolution: generated.expectedSolution,
    languageId: generated.languageId,
    testCases: generated.testCases,
  };
}

/**
 * Checks an output that already passed its strict schema against the registered request (018
 * contracts/exam-generator.md "Validation", FR-005): the count and the count per type (so no type that
 * wasn't asked), at most the requested trick questions, every topic among the chosen ones, the code
 * language the request's, the structure of manual input (answer key, 3–5 alternatives with one correct,
 * 1–3 distinct topics, a difficulty) and no two statements equal after `searchKey`. Pure; the first
 * violation throws `ProposalRejected(reason)` and the whole output is refused — the reason is a code,
 * never content. Returns the questions as exam inputs, in output order.
 */
export function validateGeneratedExam({ questions }: GeneratedExam, { request, topics }: Pick<ExamGenerationRequestContent, "request" | "topics">): ExamQuestionEdit[] {
  if (questions.length !== request.quantity) throw new ProposalRejected("COUNT_MISMATCH");
  for (const type of WorkQuestionTypeSchema.options) {
    if (questions.filter((question) => question.type === type).length !== request.counts[type]) throw new ProposalRejected("TYPE_MISMATCH");
  }
  const tricks = questions.filter((question) => question.type === "MULTIPLE_CHOICE" && question.isTrickQuestion).length;
  if (tricks > request.trickCount) throw new ProposalRejected("TRICK_MISMATCH");

  const chosen = new Set(topics.map((topic) => topic.id));
  if (questions.some((question) => question.topicIds.some((id) => !chosen.has(id)))) throw new ProposalRejected("TOPIC_OUT_OF_SCOPE");
  if (questions.some((question) => question.type === "CODE" && question.languageId !== request.language?.id)) throw new ProposalRejected("LANGUAGE_MISMATCH");

  const inputs = questions.map((question) => {
    const parsed = ExamQuestionEditSchema.safeParse(generatedQuestionEdit(question));
    if (!parsed.success) throw new ProposalRejected("STRUCTURE_INVALID");
    return parsed.data;
  });
  if (examStructureViolations(inputs).length > 0 || inputs.some((input) => !input.difficulty)) throw new ProposalRejected("STRUCTURE_INVALID");

  const statements = inputs.map((input) => searchKey(input.statement));
  if (new Set(statements).size !== statements.length) throw new ProposalRejected("DUPLICATE_STATEMENT");
  return inputs;
}
