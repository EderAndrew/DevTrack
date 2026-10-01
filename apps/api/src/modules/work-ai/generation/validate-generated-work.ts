import {
  type GeneratedWork,
  type GeneratedWorkQuestion,
  WorkQuestionTypeSchema,
} from "@repo/contracts";
import { searchKey } from "../../../platform/text/search-key";
import {
  checkWorkQuestion,
  duplicateStatementPositions,
} from "../../works/rules/work-rules";
import { ProposalRejected } from "./proposal-rejected";
import type { WorkGenerationRequestContent } from "./request-content";

/**
 * The question input of a generated one (research W10, FR-028): its topics are the request's
 * items its refs point at, its language the request's; the output never chooses them. The rules
 * of manual input apply to it as they are (FR-008).
 */
export function generatedQuestionInput(
  generated: GeneratedWorkQuestion,
  target: { languageId: string | null; topicItemIds: string[] },
): unknown {
  const common = {
    statement: generated.statement,
    explanation: generated.explanation,
    topicItemIds: target.topicItemIds,
  };
  if (generated.type === "OPEN_ANSWER")
    return {
      type: generated.type,
      ...common,
      expectedAnswer: generated.expectedAnswer,
      rubric: generated.rubric,
    };
  if (generated.type === "MULTIPLE_CHOICE") {
    return {
      type: generated.type,
      ...common,
      alternatives: generated.alternatives,
      isTrickQuestion: generated.isTrickQuestion,
    };
  }
  return {
    type: generated.type,
    ...common,
    instructions: generated.instructions,
    starterCode: generated.starterCode,
    expectedSolution: generated.expectedSolution,
    languageId: target.languageId,
    testCases: generated.testCases,
  };
}

/**
 * Stand for the request's language and topics in the pure check: which rows they are is known
 * only in `materialize`, which checks every question again with the real ones.
 */
const ANY_LANGUAGE_ID = "00000000-0000-4000-8000-000000000000";
const placeholderTopicId = (position: number) =>
  `00000000-0000-4000-8000-${String(position + 1).padStart(12, "0")}`;

/**
 * Checks an output that already passed its strict schema against the registered request (011
 * research W13, FR-027): total, count per type (so no type that wasn't asked), difficulty, trick
 * questions (multiple choice only, exactly the requested number), the language of every code
 * question, each question's refs inside the selection and at least one, the per-type structure of
 * manual input (answer key, 3–5 alternatives with one correct, at most 3 distinct topics), at
 * least one test case per code question, no two statements equal after `searchKey`, and every
 * selected topic cited. Pure; the first violation throws `ProposalRejected(reason)` and the whole
 * output is refused — the reason is a code, never content.
 */
export function validateGeneratedWork(
  { questions }: GeneratedWork,
  { request, topics }: Pick<WorkGenerationRequestContent, "request" | "topics">,
): void {
  if (questions.length !== request.total)
    throw new ProposalRejected("COUNT_MISMATCH");

  for (const type of WorkQuestionTypeSchema.options) {
    if (
      questions.filter((question) => question.type === type).length !==
      request.counts[type]
    )
      throw new ProposalRejected("TYPE_MISMATCH");
  }
  if (questions.some((question) => question.difficulty !== request.difficulty))
    throw new ProposalRejected("DIFFICULTY_MISMATCH");

  const tricks = questions.filter(
    (question) =>
      question.type === "MULTIPLE_CHOICE" && question.isTrickQuestion,
  ).length;
  if (tricks !== request.trickQuestions)
    throw new ProposalRejected("TRICK_MISMATCH");

  const language =
    request.language === null ? null : searchKey(request.language);
  if (
    questions.some(
      (question) =>
        question.type === "CODE" &&
        (language === null || searchKey(question.language) !== language),
    )
  ) {
    throw new ProposalRejected("LANGUAGE_MISMATCH");
  }

  const positionByRef = new Map(
    topics.map((topic, position) => [topic.ref, position]),
  );
  if (
    questions.some(
      (question) =>
        question.topicRefs.length === 0 ||
        question.topicRefs.some((ref) => !positionByRef.has(ref)),
    )
  ) {
    throw new ProposalRejected("TOPIC_OUT_OF_SCOPE");
  }

  const structureValid = questions.every((question) => {
    const topicItemIds = question.topicRefs.map((ref) =>
      placeholderTopicId(positionByRef.get(ref)!),
    );
    return (
      checkWorkQuestion(
        generatedQuestionInput(question, {
          languageId: ANY_LANGUAGE_ID,
          topicItemIds,
        }),
      ).input !== null
    );
  });
  if (!structureValid) throw new ProposalRejected("STRUCTURE_INVALID");

  if (
    questions.some(
      (question) => question.type === "CODE" && question.testCases.length === 0,
    )
  )
    throw new ProposalRejected("TEST_CASES_MISSING");

  if (
    duplicateStatementPositions(questions.map((question) => question.statement))
      .length > 0
  )
    throw new ProposalRejected("DUPLICATE_STATEMENT");

  const cited = new Set(questions.flatMap((question) => question.topicRefs));
  if (topics.some((topic) => !cited.has(topic.ref)))
    throw new ProposalRejected("TOPIC_NOT_COVERED");
}
