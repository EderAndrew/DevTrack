import type { Prisma } from "../../generated/prisma/client";
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
  language: { select: { id: true, name: true } },
  alternatives: { select: { id: true, text: true, isCorrect: true, position: true } },
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
