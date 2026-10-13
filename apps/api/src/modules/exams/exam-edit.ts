import { type ExamQuestionEdit, gradeToCents, type UpdateExamRequest } from "@repo/contracts";
import { byPosition, workQuestionType } from "../works/types";
import { asWorkQuestionInput, type ExamQuestionRecord, type ExamRecord } from "./types";

/** The header fields an edit may change, in the order `exam.edited` lists them. */
const HEADER_FIELDS = ["title", "description", "totalGrade", "topics"] as const;

/** What an edit changes (contracts/audit-events.md, `exam.edited`): names and a flag only. */
export interface ExamEditDiff {
  /** Header fields that changed, then `questions` when the questions changed in any way. */
  fields: string[];
  questionCountChanged: boolean;
}

/** One question's content in a comparable shape, from an input or from the database. */
function contentKey(content: {
  statement: string;
  explanation: string | null;
  difficulty: string | null;
  columns: object;
  alternatives: { text: string; isCorrect: boolean }[];
  testCases: { input: string; expectedOutput: string; visibility: string }[];
  topicIds: readonly string[];
}): string {
  return JSON.stringify([
    content.statement,
    content.explanation,
    content.difficulty,
    content.columns,
    content.alternatives.map(({ text, isCorrect }) => [text, isCorrect]),
    content.testCases.map(({ input, expectedOutput, visibility }) => [input, expectedOutput, visibility]),
    // A question's topics have no order of their own.
    [...content.topicIds].sort(),
  ]);
}

function inputKey(question: ExamQuestionEdit): string {
  const input = asWorkQuestionInput(question);
  const definition = workQuestionType(input.type);
  return contentKey({
    statement: question.statement,
    explanation: question.explanation ?? null,
    difficulty: question.difficulty ?? null,
    columns: definition.columns(input as never),
    alternatives: definition.alternatives(input as never),
    testCases: definition.testCases(input as never),
    topicIds: question.topicIds,
  });
}

function recordKey(record: ExamQuestionRecord): string {
  return contentKey({
    statement: record.statement,
    explanation: record.explanation,
    difficulty: record.difficulty,
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
    topicIds: record.topicItemIds,
  });
}

/** Compares the whole exam sent back with the one stored. Pure; the kept ids are already the exam's. */
export function examEditDiff(current: ExamRecord, body: UpdateExamRequest): ExamEditDiff {
  const header: Record<(typeof HEADER_FIELDS)[number], boolean> = {
    title: body.title !== current.title,
    description: (body.description ?? null) !== current.description,
    totalGrade: gradeToCents(body.totalGrade) !== current.totalGradeCents,
    topics:
      body.syllabusRevisionId !== current.syllabusRevisionId ||
      JSON.stringify(body.topicIds) !== JSON.stringify(current.topics.map((topic) => topic.syllabusItemId)),
  };
  const stored = byPosition(current.questions);
  const byId = new Map(stored.map((question) => [question.id, question]));
  const questionsChanged =
    body.questions.length !== stored.length ||
    body.questions.some((question, index) => {
      const existing = question.id ? byId.get(question.id) : undefined;
      return !existing || stored[index]!.id !== question.id || inputKey(question) !== recordKey(existing);
    });
  return {
    fields: [...HEADER_FIELDS.filter((field) => header[field]), ...(questionsChanged ? ["questions"] : [])],
    questionCountChanged: body.questions.length !== stored.length,
  };
}
