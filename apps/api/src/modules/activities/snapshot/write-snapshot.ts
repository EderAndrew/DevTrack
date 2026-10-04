import { centsToGrade, type ActivityType, type LatePolicy } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";
import type { ActivitySnapshot } from "./snapshot";

export interface NewActivity {
  classId: string;
  teacherId: string;
  type: ActivityType;
  title: string;
  instructions: string | null;
  publishAt: Date;
  /** ASSIGNMENT only (CHECK by type, 013 K1). */
  deadline: Date | null;
  latePolicy: LatePolicy | null;
  /** ASSIGNMENT: the work and its subject (CHECK: both or neither). */
  sourceWorkId: string | null;
  sourceSubjectId: string | null;
  outOfScopeTopicCount: number;
  idempotencyKey: string;
}

/**
 * Writes the activity and its snapshot (research P2) in the caller's transaction: the questions
 * with their values in hundredths (ASSIGNMENT) or their difficulty and points (EXERCISE, 013 K2),
 * alternatives, test cases and topics. The deferred triggers check the question count, the fields
 * of each type, the sum of the values and the alternatives at commit; afterwards the snapshot never
 * changes (immutability triggers). Returns the new activity's id.
 */
export async function writeSnapshot(tx: Tx, activity: NewActivity, snapshot: ActivitySnapshot): Promise<string> {
  const { id } = await tx.classActivity.create({
    data: {
      ...activity,
      totalGrade: snapshot.totalCents === null ? null : centsToGrade(snapshot.totalCents),
      questionCount: snapshot.questions.length,
    },
    select: { id: true },
  });
  for (const question of snapshot.questions) {
    await tx.classActivityQuestion.create({
      data: {
        activityId: id,
        position: question.position,
        type: question.type,
        gradingStrategy: question.gradingStrategy,
        value: question.valueCents === null ? null : centsToGrade(question.valueCents),
        difficulty: question.difficulty,
        points: question.points,
        statement: question.statement,
        instructions: question.instructions,
        starterCode: question.starterCode,
        languageId: question.languageId,
        expectedAnswer: question.expectedAnswer,
        rubric: question.rubric,
        expectedSolution: question.expectedSolution,
        explanation: question.explanation,
        isTrickQuestion: question.isTrickQuestion,
        sourceExerciseId: question.sourceExerciseId,
        alternatives: { createMany: { data: question.alternatives } },
        testCases: { createMany: { data: question.testCases } },
        topics: { createMany: { data: question.topicItemIds.map((syllabusItemId) => ({ syllabusItemId })) } },
      },
      select: { id: true },
    });
  }
  return id;
}
