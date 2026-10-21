import type { ExerciseTeacherView } from "@repo/contracts";
import { type ExerciseRecord, exerciseType } from "../types";
import { byPosition } from "../types/definition";

/** Everything about an exercise, for its owner (010 research X12). */
export function toTeacherView(record: ExerciseRecord): ExerciseTeacherView {
  return {
    id: record.id,
    type: record.type,
    statement: record.statement,
    explanation: record.explanation,
    difficulty: record.difficulty,
    cognitiveObjective: record.cognitiveObjective,
    origin: record.origin,
    status: record.status,
    archivedFromStatus: record.archivedFromStatus,
    version: record.version,
    ...exerciseType(record.type).teacherFields(record),
    // 019: PUBLIC and PRIVATE, for the owner only; no student view has them.
    testCases: byPosition(record.testCases).map(({ position, input, expectedOutput, visibility }) => ({ position, input, expectedOutput, visibility })),
    topic: record.topic,
    humanReviewed: record.humanReviewed,
    humanEdited: record.humanEdited,
    reviewedBy: record.reviewedBy ? { name: record.reviewedBy.name } : null,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    batchId: record.generationBatchId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
