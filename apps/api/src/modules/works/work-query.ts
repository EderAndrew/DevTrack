import { centsToGrade, type GradeCents, gradeToCents, type WorkListQuery, type WorkStatus, type WorkSummary } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { type Cursor, escapeLike } from "../../platform/database/keyset";
import { searchKey } from "../../platform/text/search-key";
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

/** Page size of `GET /works` without `pageSize` (the contract caps it at 50, research W19). */
export const WORK_PAGE_SIZE_DEFAULT = 20;

/** Without a `status` filter the bank shows what's in use; ARCHIVED only when asked (US7-3). */
const DEFAULT_STATUSES: WorkStatus[] = ["DRAFT", "APPROVED"];

/**
 * The time zone of the creation period's dates (the platform's, as the class plan's "today").
 * Brazil has kept UTC-3 all year since 2019, so a date's day starts at 03:00 UTC.
 */
const dayStart = (date: string) => new Date(`${date}T00:00:00-03:00`);
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The teacher's works matching every filter (011/FR-031, research W19). The search compares
 * `searchKey(query)` with `title_search_key`, so case and accents don't matter; the topic filter
 * is an `EXISTS` on `work_topics`; the period takes whole days, both ends included. Unknown or
 * foreign ids just match nothing.
 */
export function workListWhere(teacherId: string, filters: Omit<WorkListQuery, "cursor" | "pageSize">): Prisma.WorkWhereInput {
  const term = filters.query ? searchKey(filters.query) : "";
  const createdAt: Prisma.DateTimeFilter = {
    ...(filters.createdFrom ? { gte: dayStart(filters.createdFrom) } : {}),
    ...(filters.createdTo ? { lt: new Date(dayStart(filters.createdTo).getTime() + DAY_MS) } : {}),
  };
  return {
    teacherId,
    status: filters.status ?? { in: DEFAULT_STATUSES },
    subjectId: filters.subjectId,
    syllabusRevisionId: filters.syllabusRevisionId,
    origin: filters.origin,
    difficulty: filters.difficulty,
    ...(filters.syllabusItemId ? { topics: { some: { syllabusItemId: filters.syllabusItemId } } } : {}),
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    ...(term ? { titleSearchKey: { contains: escapeLike(term) } } : {}),
  };
}

/**
 * Rows strictly after `after` in `updated_at DESC, id DESC` order. The keyset cursor's instant is
 * the last row's `updatedAt` (stored with millisecond precision, as the cursor keeps it).
 */
export const afterUpdated = (after: Cursor): Prisma.WorkWhereInput => ({
  OR: [{ updatedAt: { lt: after.createdAt } }, { updatedAt: after.createdAt, id: { lt: after.id } }],
});

/** What a line of the bank shows: the header and the topics, never the questions. */
export const WORK_SUMMARY_SELECT = {
  id: true,
  subject: { select: { id: true, name: true } },
  title: true,
  difficulty: true,
  totalGrade: true,
  questionCount: true,
  origin: true,
  status: true,
  humanEdited: true,
  createdAt: true,
  updatedAt: true,
  topics: { orderBy: { position: "asc" }, select: { syllabusItem: { select: { id: true, text: true } } } },
} as const satisfies Prisma.WorkSelect;

type WorkSummaryRow = Prisma.WorkGetPayload<{ select: typeof WORK_SUMMARY_SELECT }>;

export function toWorkSummary(row: WorkSummaryRow): WorkSummary {
  return {
    id: row.id,
    subject: row.subject,
    title: row.title,
    difficulty: row.difficulty,
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
