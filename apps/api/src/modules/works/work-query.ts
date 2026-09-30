import { type GradeCents, gradeToCents } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import type { WorkRecord } from "./types";

/**
 * What a work's views read (011 research W5, W14): the header, its topics in selection order and
 * every question with its alternatives, test cases, language and topics.
 */
export const WORK_RECORD_SELECT = {
  id: true,
  subject: { select: { id: true, name: true } },
  syllabusRevisionId: true,
  topics: {
    orderBy: { position: "asc" },
    select: {
      syllabusItem: {
        select: { id: true, text: true, group: { select: { title: true } } },
      },
    },
  },
  title: true,
  description: true,
  difficulty: true,
  totalGrade: true,
  questionCount: true,
  origin: true,
  status: true,
  archivedFromStatus: true,
  version: true,
  humanReviewed: true,
  humanEdited: true,
  reviewedBy: { select: { name: true } },
  reviewedAt: true,
  generationRequestId: true,
  createdAt: true,
  updatedAt: true,
  questions: {
    orderBy: { position: "asc" },
    select: {
      id: true,
      position: true,
      type: true,
      gradingStrategy: true,
      statement: true,
      explanation: true,
      value: true,
      expectedAnswer: true,
      rubric: true,
      instructions: true,
      starterCode: true,
      expectedSolution: true,
      language: { select: { id: true, name: true } },
      isTrickQuestion: true,
      alternatives: {
        select: { id: true, position: true, text: true, isCorrect: true },
      },
      testCases: {
        select: {
          id: true,
          position: true,
          input: true,
          expectedOutput: true,
          visibility: true,
        },
      },
      /** In the order of the work's topics. */
      topics: {
        orderBy: { workTopic: { position: "asc" } },
        select: { syllabusItemId: true },
      },
    },
  },
} as const satisfies Prisma.WorkSelect;

type WorkRow = Prisma.WorkGetPayload<{ select: typeof WORK_RECORD_SELECT }>;

/** `numeric(5,2)` → hundredths; the only place a grade leaves the database (research W3). */
export function decimalToCents(value: Prisma.Decimal): GradeCents {
  return gradeToCents(value.toFixed(2));
}

export function toWorkRecord(row: WorkRow): WorkRecord {
  return {
    id: row.id,
    subject: row.subject,
    syllabusRevisionId: row.syllabusRevisionId,
    topics: row.topics.map(({ syllabusItem }) => ({
      syllabusItemId: syllabusItem.id,
      itemText: syllabusItem.text,
      groupTitle: syllabusItem.group.title,
    })),
    title: row.title,
    description: row.description,
    difficulty: row.difficulty,
    totalGradeCents: decimalToCents(row.totalGrade),
    questionCount: row.questionCount,
    origin: row.origin,
    status: row.status,
    archivedFromStatus: row.archivedFromStatus,
    version: row.version,
    humanReviewed: row.humanReviewed,
    humanEdited: row.humanEdited,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    generationRequestId: row.generationRequestId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    questions: row.questions.map(({ value, topics, ...question }) => ({
      ...question,
      valueCents: decimalToCents(value),
      topicItemIds: topics.map((topic) => topic.syllabusItemId),
    })),
  };
}
