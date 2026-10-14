import type { ActivitySource } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";
import { AppException, notFound } from "../../../platform/http/errors";
import { decimalToCents } from "../activity-query";
import { type ExamSource, snapshotFromExam } from "./from-exam";
import { type ExerciseSource, snapshotFromExercises } from "./from-exercises";
import { snapshotFromWork, type WorkSource } from "./from-work";
import type { ActivitySnapshot } from "./snapshot";

/** The bank items of a request, read with the session teacher's filter (research P1, P2). */
export type SourceContent =
  | { type: "ASSIGNMENT"; workId: string; subjectId: string; work: WorkSource }
  | { type: "EXERCISE"; exerciseIds: string[]; exercises: ExerciseSource[] }
  | { type: "EXAM"; examId: string; subjectId: string; exam: ExamSource };

/**
 * Reads the source of an activity inside the creating transaction. The rows are locked `FOR SHARE`
 * first, so an edit of the bank (which locks `FOR UPDATE` and rewrites the questions) never lands
 * between the reads of one snapshot. Another teacher's or a missing item → 404 (never revealing
 * it); an item of the teacher that is not APPROVED → `422 SOURCE_NOT_APPROVED` (FR-001), or for an
 * exam `409 EXAM_NOT_APPROVED` (018/FR-004, FR-007).
 */
export async function readSource(tx: Tx, teacherId: string, source: ActivitySource): Promise<SourceContent> {
  if (source.type === "ASSIGNMENT") return readWork(tx, teacherId, source.workId);
  if (source.type === "EXERCISE") return readExercises(tx, teacherId, source.exerciseIds);
  return readExam(tx, teacherId, source.examId);
}

/** The snapshot of the content: the work's grade, or the exercises' fixed points (013 K2). */
export function toSnapshot(content: SourceContent): ActivitySnapshot {
  if (content.type === "ASSIGNMENT") return snapshotFromWork(content.work);
  if (content.type === "EXAM") return snapshotFromExam(content.exam);
  return snapshotFromExercises(content.exercises);
}

async function readWork(tx: Tx, teacherId: string, workId: string): Promise<SourceContent> {
  const locked = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM works WHERE id = ${workId}::uuid AND teacher_id = ${teacherId}::uuid FOR SHARE`;
  if (locked.length === 0) throw notFound();
  if (locked[0]!.status !== "APPROVED") throw new AppException("SOURCE_NOT_APPROVED");

  const work = await tx.work.findUniqueOrThrow({
    where: { id: workId },
    select: {
      subjectId: true,
      totalGrade: true,
      questions: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          type: true,
          gradingStrategy: true,
          value: true,
          statement: true,
          instructions: true,
          starterCode: true,
          languageId: true,
          expectedAnswer: true,
          rubric: true,
          expectedSolution: true,
          explanation: true,
          isTrickQuestion: true,
          alternatives: { orderBy: { position: "asc" }, select: { position: true, text: true, isCorrect: true } },
          testCases: { orderBy: { position: "asc" }, select: { position: true, input: true, expectedOutput: true, visibility: true } },
          // In the order of the work's topics.
          topics: { orderBy: { workTopic: { position: "asc" } }, select: { syllabusItemId: true } },
        },
      },
    },
  });
  return {
    type: "ASSIGNMENT",
    workId,
    subjectId: work.subjectId,
    work: {
      totalCents: decimalToCents(work.totalGrade),
      questions: work.questions.map(({ value, topics, ...question }) => ({
        ...question,
        valueCents: decimalToCents(value),
        topicItemIds: topics.map((topic) => topic.syllabusItemId),
      })),
    },
  };
}

async function readExercises(tx: Tx, teacherId: string, exerciseIds: string[]): Promise<SourceContent> {
  const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
    SELECT id, status::text AS status FROM exercises
    WHERE id = ANY(${exerciseIds}::uuid[]) AND teacher_id = ${teacherId}::uuid
    ORDER BY id
    FOR SHARE`;
  if (locked.length !== exerciseIds.length) throw notFound();
  if (locked.some((row) => row.status !== "APPROVED")) throw new AppException("SOURCE_NOT_APPROVED");

  const rows = await tx.exercise.findMany({
    where: { id: { in: exerciseIds } },
    select: {
      id: true,
      type: true,
      difficulty: true,
      statement: true,
      instructions: true,
      starterCode: true,
      languageId: true,
      expectedAnswer: true,
      expectedSolution: true,
      explanation: true,
      isTrickQuestion: true,
      syllabusItemId: true,
      alternatives: { orderBy: { position: "asc" }, select: { position: true, text: true, isCorrect: true } },
      // 019/FR-002: copied with the rest of the snapshot.
      testCases: { orderBy: { position: "asc" }, select: { position: true, input: true, expectedOutput: true, visibility: true } },
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  // In the teacher's order (research P6).
  return { type: "EXERCISE", exerciseIds, exercises: exerciseIds.map((id) => byId.get(id)!) };
}

/**
 * The exam's snapshot reader (018 research T1, T3): the Banco de Provas tables read in the creating
 * transaction, never the `exams` module's code. The exam row is locked `FOR SHARE` first, as a work.
 */
async function readExam(tx: Tx, teacherId: string, examId: string): Promise<SourceContent> {
  const locked = await tx.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status FROM exams WHERE id = ${examId}::uuid AND teacher_id = ${teacherId}::uuid FOR SHARE`;
  if (locked.length === 0) throw notFound();
  if (locked[0]!.status !== "APPROVED") throw new AppException("EXAM_NOT_APPROVED");

  const exam = await tx.exam.findUniqueOrThrow({
    where: { id: examId },
    select: {
      subjectId: true,
      totalGrade: true,
      topics: { orderBy: { position: "asc" }, select: { syllabusItemId: true, syllabusItem: { select: { text: true } } } },
      questions: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          type: true,
          gradingStrategy: true,
          value: true,
          difficulty: true,
          statement: true,
          instructions: true,
          starterCode: true,
          languageId: true,
          expectedAnswer: true,
          rubric: true,
          expectedSolution: true,
          explanation: true,
          isTrickQuestion: true,
          alternatives: { orderBy: { position: "asc" }, select: { position: true, text: true, isCorrect: true } },
          testCases: { orderBy: { position: "asc" }, select: { position: true, input: true, expectedOutput: true, visibility: true } },
          // In the order of the exam's topics.
          topics: { orderBy: { examTopic: { position: "asc" } }, select: { syllabusItemId: true } },
        },
      },
    },
  });
  return {
    type: "EXAM",
    examId,
    subjectId: exam.subjectId,
    exam: {
      totalCents: decimalToCents(exam.totalGrade),
      topics: exam.topics.map((topic) => ({ syllabusItemId: topic.syllabusItemId, title: topic.syllabusItem.text })),
      questions: exam.questions.map(({ value, topics, ...question }) => ({
        ...question,
        valueCents: decimalToCents(value),
        topicItemIds: topics.map((topic) => topic.syllabusItemId),
      })),
    },
  };
}
