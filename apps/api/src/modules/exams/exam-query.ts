import { centsToGrade, type ExamListQuery, type ExamStatus, type ExamSummary, type GradeCents, gradeToCents } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { type Cursor, escapeLike } from "../../platform/database/keyset";
import { searchKey } from "../../platform/text/search-key";
import type { ExamRecord } from "./types";

/** What an exam's views read: the header, its topics in selection order and every question in full. */
export const EXAM_RECORD_SELECT = {
  id: true,
  subject: { select: { id: true, name: true } },
  syllabusRevisionId: true,
  topics: {
    orderBy: { position: "asc" },
    select: { syllabusItem: { select: { id: true, text: true, group: { select: { title: true } } } } },
  },
  title: true,
  description: true,
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
      difficulty: true,
      expectedAnswer: true,
      rubric: true,
      instructions: true,
      starterCode: true,
      expectedSolution: true,
      language: { select: { id: true, name: true, highlight: true } },
      isTrickQuestion: true,
      alternatives: { select: { id: true, position: true, text: true, isCorrect: true } },
      testCases: { select: { id: true, position: true, input: true, expectedOutput: true, visibility: true } },
      /** In the order of the exam's topics. */
      topics: { orderBy: { examTopic: { position: "asc" } }, select: { syllabusItemId: true } },
    },
  },
} as const satisfies Prisma.ExamSelect;

type ExamRow = Prisma.ExamGetPayload<{ select: typeof EXAM_RECORD_SELECT }>;

/** `numeric(5,2)` → hundredths; the only place a grade leaves the database (011 research W3). */
export function decimalToCents(value: Prisma.Decimal): GradeCents {
  return gradeToCents(value.toFixed(2));
}

export function toExamRecord(row: ExamRow): ExamRecord {
  return {
    id: row.id,
    subject: row.subject,
    syllabusRevisionId: row.syllabusRevisionId,
    topics: row.topics.map(({ syllabusItem }) => ({ syllabusItemId: syllabusItem.id, itemText: syllabusItem.text, groupTitle: syllabusItem.group.title })),
    title: row.title,
    description: row.description,
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

/** Page size of `GET /exams` without `limit` (the contract caps it at 50). */
export const EXAM_PAGE_SIZE_DEFAULT = 20;

/** Without a `status` filter the bank shows what's in use; ARCHIVED only when asked. */
const DEFAULT_STATUSES: ExamStatus[] = ["DRAFT", "APPROVED"];

/**
 * The teacher's exams matching every filter. The search compares `searchKey(q)` with
 * `title_search_key`, so case and accents don't matter; unknown or foreign ids just match nothing.
 */
export function examListWhere(teacherId: string, filters: Pick<ExamListQuery, "status" | "subjectId" | "q">): Prisma.ExamWhereInput {
  const term = filters.q ? searchKey(filters.q) : "";
  return {
    teacherId,
    status: filters.status ?? { in: DEFAULT_STATUSES },
    subjectId: filters.subjectId,
    ...(term ? { titleSearchKey: { contains: escapeLike(term) } } : {}),
  };
}

/** Rows strictly after `after` in `updated_at DESC, id DESC` order. */
export const afterUpdated = (after: Cursor): Prisma.ExamWhereInput => ({
  OR: [{ updatedAt: { lt: after.createdAt } }, { updatedAt: after.createdAt, id: { lt: after.id } }],
});

/** What a line of the bank shows: the header and the topics, never the questions. */
export const EXAM_SUMMARY_SELECT = {
  id: true,
  subject: { select: { id: true, name: true } },
  title: true,
  totalGrade: true,
  questionCount: true,
  origin: true,
  status: true,
  humanEdited: true,
  createdAt: true,
  updatedAt: true,
  topics: { orderBy: { position: "asc" }, select: { syllabusItem: { select: { id: true, text: true } } } },
} as const satisfies Prisma.ExamSelect;

type ExamSummaryRow = Prisma.ExamGetPayload<{ select: typeof EXAM_SUMMARY_SELECT }>;

export function toExamSummary(row: ExamSummaryRow): ExamSummary {
  return {
    id: row.id,
    subject: row.subject,
    title: row.title,
    totalGrade: centsToGrade(decimalToCents(row.totalGrade)),
    questionCount: row.questionCount,
    origin: row.origin,
    status: row.status,
    topics: row.topics.map(({ syllabusItem }) => ({ syllabusItemId: syllabusItem.id, itemText: syllabusItem.text })),
    humanEdited: row.humanEdited,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
