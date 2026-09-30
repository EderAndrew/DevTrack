import { gradeToCents, type UpdateWorkRequest } from "@repo/contracts";
import { workQuestionContentRows } from "./rules/work-rules";
import {
  type AnyWorkQuestionInput,
  byPosition,
  type WorkQuestionRecord,
  type WorkRecord,
} from "./types";

/** The header fields an edit may change, in the order `work.edited` lists them. */
const HEADER_FIELDS = [
  "title",
  "description",
  "difficulty",
  "totalGrade",
  "topics",
] as const;

/** What an edit changes (contracts/audit-events.md, `work.edited`): names and counts only. */
export interface WorkEditDiff {
  /** Header fields that changed, then `questions` when a kept question's content changed. */
  fields: string[];
  questionCountChanged: boolean;
  questionsAdded: number;
  questionsRemoved: number;
  /** The kept questions are in another relative order. */
  reordered: boolean;
}

/** One question's content in a comparable shape, from an input or from the database. */
function contentKey(content: {
  statement: string;
  explanation: string | null;
  columns: object;
  alternatives: { text: string; isCorrect: boolean }[];
  testCases: { input: string; expectedOutput: string; visibility: string }[];
  topicItemIds: readonly string[];
}): string {
  return JSON.stringify([
    content.statement,
    content.explanation,
    content.columns,
    content.alternatives.map(({ text, isCorrect }) => [text, isCorrect]),
    content.testCases.map(({ input, expectedOutput, visibility }) => [
      input,
      expectedOutput,
      visibility,
    ]),
    // A question's topics have no order of their own.
    [...content.topicItemIds].sort(),
  ]);
}

function inputKey(input: AnyWorkQuestionInput): string {
  const rows = workQuestionContentRows(input);
  return contentKey({ ...rows, topicItemIds: input.topicItemIds ?? [] });
}

function recordKey(record: WorkQuestionRecord): string {
  return contentKey({
    statement: record.statement,
    explanation: record.explanation,
    columns: {
      expectedAnswer: record.expectedAnswer,
      rubric: record.rubric,
      instructions: record.instructions,
      starterCode: record.starterCode,
      expectedSolution: record.expectedSolution,
      languageId: record.language?.id ?? null,
      isTrickQuestion: record.isTrickQuestion,
    },
    alternatives: byPosition(record.alternatives),
    testCases: byPosition(record.testCases),
    topicItemIds: record.topicItemIds,
  });
}

/**
 * Compares the whole work sent back (research W16) with the one stored. Pure; the questions of
 * `body` with an `id` are already known to be the work's.
 */
export function workEditDiff(
  current: WorkRecord,
  body: UpdateWorkRequest,
): WorkEditDiff {
  const topics =
    body.topics === null
      ? null
      : {
          revisionId: body.topics.syllabusRevisionId,
          itemIds: body.topics.syllabusItemIds,
        };
  const currentTopics =
    current.syllabusRevisionId === null
      ? null
      : {
          revisionId: current.syllabusRevisionId,
          itemIds: current.topics.map((topic) => topic.syllabusItemId),
        };
  const header: Record<(typeof HEADER_FIELDS)[number], boolean> = {
    title: body.title !== current.title,
    description: (body.description ?? null) !== current.description,
    difficulty: (body.difficulty ?? null) !== current.difficulty,
    totalGrade: gradeToCents(body.totalGrade) !== current.totalGradeCents,
    topics: JSON.stringify(topics) !== JSON.stringify(currentTopics),
  };

  const stored = byPosition(current.questions);
  const byId = new Map(stored.map((question) => [question.id, question]));
  const kept = body.questions.filter(
    (question): question is AnyWorkQuestionInput & { id: string } =>
      question.id !== undefined,
  );
  const keptIds = new Set(kept.map((question) => question.id));
  const contentChanged = kept.some(
    (question) => inputKey(question) !== recordKey(byId.get(question.id)!),
  );
  const storedOrder = stored
    .filter((question) => keptIds.has(question.id))
    .map((question) => question.id);

  return {
    fields: [
      ...HEADER_FIELDS.filter((field) => header[field]),
      ...(contentChanged ? ["questions"] : []),
    ],
    questionCountChanged: body.questions.length !== stored.length,
    questionsAdded: body.questions.length - kept.length,
    questionsRemoved: stored.length - kept.length,
    reordered: storedOrder.some((id, index) => kept[index]!.id !== id),
  };
}

/** Nothing to save: no field, no question added, removed or moved. */
export function isEmptyEdit(diff: WorkEditDiff): boolean {
  return (
    diff.fields.length === 0 &&
    diff.questionsAdded === 0 &&
    diff.questionsRemoved === 0 &&
    !diff.reordered
  );
}
