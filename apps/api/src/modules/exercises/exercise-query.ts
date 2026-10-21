import type { ExerciseListQuery, ExerciseStatus } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { type Cursor, escapeLike } from "../../platform/database/keyset";
import { searchKey } from "../../platform/text/search-key";
import type { ExerciseRecord } from "./types";

/** What an `ExerciseRecord` needs from `exercises` and its relations (010 research X12). */
export const EXERCISE_RECORD_SELECT = {
  id: true,
  type: true,
  statement: true,
  explanation: true,
  difficulty: true,
  cognitiveObjective: true,
  origin: true,
  status: true,
  archivedFromStatus: true,
  version: true,
  expectedAnswer: true,
  instructions: true,
  starterCode: true,
  expectedSolution: true,
  isTrickQuestion: true,
  humanReviewed: true,
  humanEdited: true,
  reviewedAt: true,
  generationBatchId: true,
  createdAt: true,
  updatedAt: true,
  language: { select: { id: true, name: true, highlight: true } },
  alternatives: { select: { id: true, text: true, isCorrect: true, position: true } },
  testCases: { select: { position: true, input: true, expectedOutput: true, visibility: true } },
  reviewedBy: { select: { name: true } },
  syllabusItem: {
    select: {
      id: true,
      text: true,
      revisionId: true,
      revision: { select: { document: { select: { subject: { select: { id: true, name: true } } } } } },
    },
  },
} satisfies Prisma.ExerciseSelect;

export type ExerciseRow = Prisma.ExerciseGetPayload<{ select: typeof EXERCISE_RECORD_SELECT }>;

export function toExerciseRecord({ syllabusItem, ...row }: ExerciseRow): ExerciseRecord {
  const subject = syllabusItem?.revision.document.subject;
  return {
    ...row,
    topic:
      syllabusItem && subject
        ? {
            syllabusItemId: syllabusItem.id,
            itemText: syllabusItem.text,
            subjectId: subject.id,
            subjectName: subject.name,
            syllabusRevisionId: syllabusItem.revisionId,
          }
        : null,
  };
}

/** Page size of `GET /exercises` without `pageSize` (the contract caps it at 50). */
export const EXERCISE_PAGE_SIZE_DEFAULT = 20;

/** Without a `status` filter the bank shows what's in use; ARCHIVED only when asked (FR-034). */
const DEFAULT_STATUSES: ExerciseStatus[] = ["DRAFT", "APPROVED"];

/**
 * The teacher's exercises matching every filter (010 FR-034, research X20). The search compares
 * `searchKey(query)` with `statement_search_key`, so case and accents don't matter; the filters
 * by subject and revision go through the topic. Unknown or foreign ids just match nothing.
 */
export function exerciseListWhere(teacherId: string, filters: Omit<ExerciseListQuery, "cursor" | "pageSize">): Prisma.ExerciseWhereInput {
  const term = filters.query ? searchKey(filters.query) : "";
  const topic: Prisma.SyllabusItemWhereInput = {
    ...(filters.syllabusRevisionId ? { revisionId: filters.syllabusRevisionId } : {}),
    ...(filters.subjectId ? { revision: { document: { subjectId: filters.subjectId } } } : {}),
  };
  return {
    teacherId,
    status: filters.status ?? { in: DEFAULT_STATUSES },
    difficulty: filters.difficulty,
    cognitiveObjective: filters.cognitiveObjective,
    type: filters.type,
    origin: filters.origin,
    languageId: filters.languageId,
    syllabusItemId: filters.syllabusItemId,
    ...(Object.keys(topic).length > 0 ? { syllabusItem: topic } : {}),
    ...(term ? { statementSearchKey: { contains: escapeLike(term) } } : {}),
  };
}

/**
 * Rows strictly after `after` in `updated_at DESC, id DESC` order. The keyset cursor's instant is
 * the last row's `updatedAt` (stored by Prisma with millisecond precision, as the cursor keeps it).
 */
export const afterUpdated = (after: Cursor): Prisma.ExerciseWhereInput => ({
  OR: [{ updatedAt: { lt: after.createdAt } }, { updatedAt: after.createdAt, id: { lt: after.id } }],
});
