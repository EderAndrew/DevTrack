import type { ExerciseResult } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";
import { answerOfRow, isBlankAnswer } from "../status/answers";
import { pointsFor, resultFor } from "./exercise-results";

export interface CompleteAttemptInput {
  attemptId: string;
  /** 1 is the student's first conclusion, the only one that scores (013 K3). */
  attemptNumber: number;
  activityId: string;
  classId: string;
  studentUserId: string;
  /** Server clock. */
  now: Date;
}

/** The counts of `exercise_attempt.completed` (contracts/audit-events.md): numbers only. */
export interface CompletedAttempt {
  first: boolean;
  questionCount: number;
  blankCount: number;
  correctCount: number;
  pendingCount: number;
  alreadyScoredCount: number;
  points: number;
}

/**
 * Concludes an IN_PROGRESS EXERCISE attempt, already locked `FOR UPDATE` by the caller with its
 * pending answers written (013/FR-007–FR-010a, research K5, K6), in the caller's transaction: the
 * attempt goes SUBMITTED with `completed_at` (its answers freeze, by trigger), and each question gets
 * its result row. Attempt 1 claims the question's exercise for the student in the class with
 * `INSERT … ON CONFLICT … WHERE scoring DO NOTHING`; when another activity of the class holds that
 * slot (or holds it first under concurrency) the row is written without scoring — "já pontuado". A
 * later attempt never scores. No submission or grading row is written (those tables refuse
 * EXERCISE). The caller decides the rules and writes the audit event.
 */
export async function completeAttempt(tx: Tx, input: CompleteAttemptInput): Promise<CompletedAttempt> {
  const { attemptId, activityId, classId, studentUserId, now } = input;
  const first = input.attemptNumber === 1;
  await tx.activityAttempt.update({ where: { id: attemptId }, data: { status: "SUBMITTED", completedAt: now } });

  const questions = await tx.classActivityQuestion.findMany({
    where: { activityId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      type: true,
      starterCode: true,
      points: true,
      sourceExerciseId: true,
      alternatives: { where: { isCorrect: true }, select: { id: true } },
    },
  });
  const answers = new Map(
    (
      await tx.activityAnswer.findMany({
        where: { attemptId },
        select: { questionId: true, questionType: true, text: true, alternativeId: true, source: true },
      })
    ).map((row) => [row.questionId, answerOfRow(row)]),
  );

  const outcome: CompletedAttempt = {
    first,
    questionCount: questions.length,
    blankCount: 0,
    correctCount: 0,
    pendingCount: 0,
    alreadyScoredCount: 0,
    points: 0,
  };
  for (const question of questions) {
    // The snapshot of an EXERCISE has both (CHECK of `class_activity_questions`).
    const questionPoints = question.points!;
    const sourceExerciseId = question.sourceExerciseId!;
    const ruleQuestion = {
      id: question.id,
      type: question.type,
      starterCode: question.starterCode,
      correctAlternativeId: question.alternatives[0]?.id ?? null,
    };
    const answer = answers.get(question.id) ?? null;
    if (answer === null || isBlankAnswer(ruleQuestion, answer)) outcome.blankCount += 1;

    const row = { attemptId, questionId: question.id, activityId, questionPoints, classId, studentUserId, sourceExerciseId, now };
    let scoring = false;
    let decided = await resultFor(ruleQuestion, answer, { scoring: first });
    if (first && (await insertResult(tx, { ...row, scoring: true, ...decided }))) {
      scoring = true;
    } else {
      if (first) {
        // The exercise already scored in another activity of the class (013/FR-010a).
        outcome.alreadyScoredCount += 1;
        decided = await resultFor(ruleQuestion, answer, { scoring: false });
      }
      await insertResult(tx, { ...row, scoring: false, ...decided });
    }
    if (decided.result === "CORRECT") outcome.correctCount += 1;
    if (decided.result === "PENDING_TEACHER") outcome.pendingCount += 1;
    outcome.points += pointsFor(decided.result, scoring, questionPoints);
  }
  return outcome;
}

/**
 * One result row; a scoring row whose `(class, student, exercise)` slot is taken writes nothing and
 * answers false (the partial UNIQUE `exercise_question_results_once_per_class`, research K6).
 */
async function insertResult(
  tx: Tx,
  row: {
    attemptId: string;
    questionId: string;
    activityId: string;
    questionPoints: number;
    classId: string;
    studentUserId: string;
    sourceExerciseId: string;
    scoring: boolean;
    result: ExerciseResult;
    nature: "RULE_RESULT" | null;
    now: Date;
  },
): Promise<boolean> {
  const points = pointsFor(row.result, row.scoring, row.questionPoints);
  const inserted = await tx.$queryRaw<{ question_id: string }[]>`
    INSERT INTO exercise_question_results
      (attempt_id, question_id, activity_id, question_points, class_id, student_user_id, source_exercise_id,
       scoring, result, points, nature, created_at, updated_at)
    VALUES
      (${row.attemptId}::uuid, ${row.questionId}::uuid, ${row.activityId}::uuid, ${row.questionPoints}, ${row.classId}::uuid,
       ${row.studentUserId}::uuid, ${row.sourceExerciseId}::uuid, ${row.scoring}, ${row.result}::exercise_result, ${points},
       ${row.nature}::activity_grading_nature, ${row.now}, ${row.now})
    ON CONFLICT (class_id, student_user_id, source_exercise_id) WHERE scoring DO NOTHING
    RETURNING question_id`;
  return inserted.length === 1;
}
