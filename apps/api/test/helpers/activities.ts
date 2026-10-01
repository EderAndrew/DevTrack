import { randomUUID } from "node:crypto";
import type {
  ActivityLatePolicy,
  ActivityQuestionType,
  ClassActivity,
  ClassActivityStatus,
  ClassActivityType,
  SchoolClass,
  WorkTestCaseVisibility,
} from "../../src/generated/prisma/client";
import { createClass, createEnrollment, createMeetings, createPlan, createTopic, createUser, type TestUser } from "./factories";
import { languageId } from "./exercises";
import type { TestApp } from "./test-app";

// ── 012: class activities, written straight to the database (tasks T018) ─────────────────
// The helpers that go through the routes (`applyWork`, `startAttempt`, `submitAttempt`…) arrive
// with their routes (T022, T034, T043).

export interface ClassWithStudents {
  schoolClass: SchoolClass;
  students: TestUser[];
}

/** A class of `teacherId` with `students` students holding an ACTIVE enrollment (003). */
export async function createClassWithStudents(
  t: TestApp,
  teacherId: string,
  options: { subjectId?: string | null; students?: number; status?: SchoolClass["status"] } = {},
): Promise<ClassWithStudents> {
  const schoolClass = await createClass(t, teacherId, { subjectId: options.subjectId ?? null, status: options.status });
  const students: TestUser[] = [];
  for (let index = 0; index < (options.students ?? 1); index += 1) {
    const student = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, student.id);
    students.push(student);
  }
  return { schoolClass, students };
}

/**
 * Marks `itemIds` as taught in the class (research P5): an ACTIVE plan on `revisionId`, a held
 * meeting and one COMPLETED topic linked to the items (004 US9).
 */
export async function createCompletedTopics(t: TestApp, classId: string, revisionId: string, itemIds: string[]): Promise<void> {
  const plan = await createPlan(t, classId, revisionId, { status: "ACTIVE" });
  const [meeting] = await createMeetings(t, classId, ["2026-09-01"]);
  await createTopic(t, plan.id, { meetingId: meeting!.id, itemIds, status: "COMPLETED" });
}

export interface ActivityQuestionSpec {
  type: ActivityQuestionType;
  /** Integer hundredths; default: the activity's total split evenly is the caller's job, 100 when alone. */
  valueCents?: number;
  statement?: string;
  /** MULTIPLE_CHOICE: texts in order; default 3 alternatives. */
  alternatives?: string[];
  /** MULTIPLE_CHOICE: index of the correct alternative; default 0. */
  correctIndex?: number;
  /** CODE: test cases; default none. */
  testCases?: { input: string; expectedOutput: string; visibility: WorkTestCaseVisibility }[];
  topicItemIds?: string[];
  expectedAnswer?: string;
  rubric?: string | null;
  explanation?: string | null;
  instructions?: string | null;
  starterCode?: string | null;
  expectedSolution?: string;
  isTrickQuestion?: boolean;
}

export interface CreateActivityOptions {
  type?: ClassActivityType;
  title?: string;
  instructions?: string | null;
  /** Default: one MULTIPLE_CHOICE question worth 1.00. */
  questions?: ActivityQuestionSpec[];
  publishAt?: Date;
  deadline?: Date;
  latePolicy?: ActivityLatePolicy;
  status?: ClassActivityStatus;
  /** ASSIGNMENT only (CHECK). */
  sourceWorkId?: string;
  sourceSubjectId?: string;
  resultReleasedAt?: Date | null;
  outOfScopeTopicCount?: number;
}

export interface CreatedActivity {
  activity: ClassActivity;
  questionIds: string[];
  /** Alternative ids per question, in position order (empty for other types). */
  alternativeIds: string[][];
  /** Correct alternative id per question (null for other types). */
  correctAlternativeIds: (string | null)[];
}

const STRATEGY = { OPEN_ANSWER: "AI_REVIEW", MULTIPLE_CHOICE: "EXACT_MATCH", CODE: "TEST_CASES" } as const;
const cents = (value: number) => (value / 100).toFixed(2);

/**
 * Writes a class activity and its snapshot in one transaction (the deferred triggers check the
 * question count, the value sum and the alternatives at commit), for the student stories that don't
 * go through the teacher's routes. Default: an EXERCISE published a day ago, due in a week, REJECT.
 */
export async function createActivity(
  t: TestApp,
  schoolClass: Pick<SchoolClass, "id" | "teacherId">,
  options: CreateActivityOptions = {},
): Promise<CreatedActivity> {
  const now = Date.now();
  const specs = options.questions ?? [{ type: "MULTIPLE_CHOICE" as const, valueCents: 100 }];
  const values = specs.map((spec) => spec.valueCents ?? 100);
  const totalCents = values.reduce((sum, value) => sum + value, 0);
  const java = specs.some((spec) => spec.type === "CODE") ? await languageId(t, "java") : null;
  const status = options.status ?? "ACTIVE";

  return t.prisma.$transaction(async (tx) => {
    const activity = await tx.classActivity.create({
      data: {
        classId: schoolClass.id,
        teacherId: schoolClass.teacherId,
        type: options.type ?? "EXERCISE",
        status,
        title: options.title ?? "Atividade de teste",
        instructions: options.instructions ?? null,
        totalGrade: cents(totalCents),
        questionCount: specs.length,
        publishAt: options.publishAt ?? new Date(now - 24 * 3_600_000),
        deadline: options.deadline ?? new Date(now + 7 * 24 * 3_600_000),
        latePolicy: options.latePolicy ?? "REJECT",
        sourceWorkId: options.sourceWorkId ?? null,
        sourceSubjectId: options.sourceSubjectId ?? null,
        outOfScopeTopicCount: options.outOfScopeTopicCount ?? 0,
        closedAt: status === "CLOSED" ? new Date(now) : null,
        cancelledAt: status === "CANCELLED" ? new Date(now) : null,
        ...(options.resultReleasedAt
          ? { resultReleasedAt: options.resultReleasedAt, resultReleasedById: schoolClass.teacherId }
          : {}),
        idempotencyKey: randomUUID(),
      },
    });
    const questionIds: string[] = [];
    const alternativeIds: string[][] = [];
    const correctAlternativeIds: (string | null)[] = [];
    for (const [position, spec] of specs.entries()) {
      const question = await tx.classActivityQuestion.create({
        data: {
          activityId: activity.id,
          position,
          type: spec.type,
          gradingStrategy: STRATEGY[spec.type],
          value: cents(values[position]!),
          statement: spec.statement ?? `Enunciado ${position + 1}`,
          expectedAnswer: spec.type === "OPEN_ANSWER" ? (spec.expectedAnswer ?? "Resposta esperada") : null,
          rubric: spec.type === "OPEN_ANSWER" ? (spec.rubric ?? null) : null,
          instructions: spec.type === "CODE" ? (spec.instructions ?? null) : null,
          starterCode: spec.type === "CODE" ? (spec.starterCode ?? null) : null,
          expectedSolution: spec.type === "CODE" ? (spec.expectedSolution ?? "class Solucao {}") : null,
          languageId: spec.type === "CODE" ? java : null,
          explanation: spec.explanation ?? null,
          isTrickQuestion: spec.isTrickQuestion ?? false,
        },
      });
      questionIds.push(question.id);
      const ids: string[] = [];
      if (spec.type === "MULTIPLE_CHOICE") {
        const texts = spec.alternatives ?? ["Alternativa A", "Alternativa B", "Alternativa C"];
        for (const [index, text] of texts.entries()) {
          const alternative = await tx.classActivityAlternative.create({
            data: { questionId: question.id, position: index, text, isCorrect: index === (spec.correctIndex ?? 0) },
          });
          ids.push(alternative.id);
        }
      }
      alternativeIds.push(ids);
      correctAlternativeIds.push(spec.type === "MULTIPLE_CHOICE" ? ids[spec.correctIndex ?? 0]! : null);
      for (const [index, testCase] of (spec.testCases ?? []).entries()) {
        await tx.classActivityTestCase.create({ data: { questionId: question.id, position: index, ...testCase } });
      }
      for (const syllabusItemId of spec.topicItemIds ?? []) {
        await tx.classActivityQuestionTopic.create({ data: { questionId: question.id, syllabusItemId } });
      }
    }
    return { activity, questionIds, alternativeIds, correctAlternativeIds };
  });
}
