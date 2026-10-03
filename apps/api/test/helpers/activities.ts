import { randomUUID } from "node:crypto";
import { type Answer, EXERCISE_POINTS, type ExerciseDifficulty } from "@repo/contracts";
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
import { createExercise, languageId } from "./exercises";
import { createWork } from "./works";
import type { api, TestApp } from "./test-app";

// ── 012: class activities, written straight to the database (tasks T018) ─────────────────
// The helpers that go through the routes arrive with them: `applyWork`/`applyExercises` (T022),
// `startAttempt`/`saveAnswers` (T034), `submitAttempt` (T043), the teacher's grading routes (T045).

type ApiClient = ReturnType<typeof api>;

/** Far enough for any clock of the suites. */
export const FAR_DEADLINE = "2030-12-31T23:59:00.000Z";

/**
 * Body overrides of `POST /classes/:classId/activities`. A key set to `undefined` is left out of the
 * body; a server or forbidden field (`totalGrade`, an EXERCISE `deadline`) goes in as given, for the
 * tests that expect the 400.
 */
export interface ApplyOverrides {
  idempotencyKey?: string;
  title?: string;
  instructions?: string | null;
  totalGrade?: string;
  /** Default null: published now, by the server clock. */
  publishAt?: string | null;
  deadline?: string;
  latePolicy?: ActivityLatePolicy;
  acknowledgeOutOfScope?: boolean;
}

const applyBody = (source: object, defaults: object, overrides: ApplyOverrides) =>
  Object.fromEntries(
    Object.entries({
      idempotencyKey: randomUUID(),
      source,
      title: "Atividade aplicada",
      instructions: "Leia com atenção.",
      publishAt: null,
      acknowledgeOutOfScope: false,
      ...defaults,
      ...overrides,
    }).filter(([, value]) => value !== undefined),
  );

/** `POST /classes/:classId/activities` with a work of the teacher's bank (012/US1): deadline far ahead, REJECT. */
export function applyWork(client: ApiClient, classId: string, workId: string, overrides: ApplyOverrides = {}) {
  return client.post(
    `/api/classes/${classId}/activities`,
    applyBody({ type: "ASSIGNMENT", workId }, { deadline: FAR_DEADLINE, latePolicy: "REJECT" }, overrides),
  );
}

/**
 * `POST /classes/:classId/activities` with 1–10 exercises in this order (013/FR-001): no grade,
 * deadline or late policy unless an override puts one in on purpose.
 */
export function applyExercises(client: ApiClient, classId: string, exerciseIds: string[], overrides: ApplyOverrides = {}) {
  return client.post(`/api/classes/${classId}/activities`, applyBody({ type: "EXERCISE", exerciseIds }, {}, overrides));
}

/** `POST /me/activities/:activityId/attempt` as the student of `client` (012/US3). */
export function startAttempt(client: ApiClient, activityId: string) {
  return client.post(`/api/me/activities/${activityId}/attempt`, {});
}

/** `PUT /me/activities/:activityId/attempt/answers` with `baseRevision` per answer (research P8). */
export function saveAnswers(client: ApiClient, activityId: string, answers: { questionId: string; answer: Answer; baseRevision: number }[]) {
  return client.put(`/api/me/activities/${activityId}/attempt/answers`, { answers });
}

/** `POST /me/activities/:activityId/attempt/submit` with the pending answers (012/US4, research P9). */
export function submitAttempt(client: ApiClient, activityId: string, answers: { questionId: string; answer: Answer; baseRevision: number }[] = []) {
  return client.post(`/api/me/activities/${activityId}/attempt/submit`, { answers });
}

/** `POST /me/activities/:activityId/attempts/:number/complete` ("Concluir exercícios", 013/US2, research K5). */
export function completeAttempt(
  client: ApiClient,
  activityId: string,
  number: number,
  answers: { questionId: string; answer: Answer; baseRevision: number }[] = [],
) {
  return client.post(`/api/me/activities/${activityId}/attempts/${number}/complete`, { answers });
}

/** `POST /me/activities/:activityId/attempts` ("Refazer" after attempt `afterNumber`, 013/US2, research K4). */
export function retryAttempt(client: ApiClient, activityId: string, afterNumber: number) {
  return client.post(`/api/me/activities/${activityId}/attempts`, { afterNumber });
}

/** `GET /me/activities/:activityId/attempts/:number`: a concluded attempt with its answer key (013/FR-012). */
export function getExerciseAttempt(client: ApiClient, activityId: string, number: number) {
  return client.get(`/api/me/activities/${activityId}/attempts/${number}`);
}

/** `…/activities/:activityId` of the teacher's class, the base of the 012/US5 routes. */
const teacherActivityPath = (classId: string, activityId: string) => `/api/classes/${classId}/activities/${activityId}`;

/** `GET …/attempts/:attemptId`: answers, gradings and submission, for the teacher (012/US5). */
export function getAttempt(client: ApiClient, classId: string, activityId: string, attemptId: string) {
  return client.get(`${teacherActivityPath(classId, activityId)}/attempts/${attemptId}`);
}

/** `PUT …/attempts/:attemptId/grades` at the submission's `version` (research P13). */
export function gradeAttempt(
  client: ApiClient,
  classId: string,
  activityId: string,
  attemptId: string,
  body: { version: number; decisions: { questionId: string; grade: string; feedback?: string | null }[]; generalFeedback?: string | null },
) {
  return client.put(`${teacherActivityPath(classId, activityId)}/attempts/${attemptId}/grades`, body);
}

/** `POST …/attempts/:attemptId/accept-submission` (spec FR-006b). */
export function acceptSubmission(client: ApiClient, classId: string, activityId: string, attemptId: string) {
  return client.post(`${teacherActivityPath(classId, activityId)}/attempts/${attemptId}/accept-submission`, {});
}

/** `POST …/release` (research P14). */
export function releaseResult(client: ApiClient, classId: string, activityId: string) {
  return client.post(`${teacherActivityPath(classId, activityId)}/release`, {});
}

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
  /** ASSIGNMENT: integer hundredths; default 100 (the activity's total is their sum). */
  valueCents?: number;
  /** EXERCISE: the exercise's difficulty, which fixes its points (013 K2); default BASIC. */
  difficulty?: ExerciseDifficulty;
  /** EXERCISE: the bank exercise it was copied from; default a new APPROVED one of the teacher. */
  sourceExerciseId?: string;
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
  /** Default ASSIGNMENT: the 012 graded activity (013 left EXERCISE without grade or deadline). */
  type?: ClassActivityType;
  title?: string;
  instructions?: string | null;
  /** Default: one MULTIPLE_CHOICE question worth 1.00 (ASSIGNMENT) or BASIC (EXERCISE). */
  questions?: ActivityQuestionSpec[];
  publishAt?: Date;
  /** ASSIGNMENT only (CHECK by type); default in a week. */
  deadline?: Date;
  latePolicy?: ActivityLatePolicy;
  status?: ClassActivityStatus;
  /** ASSIGNMENT only (CHECK); default a new APPROVED work of the teacher, with its subject. */
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
 * question count, the fields of each type, the value sum and the alternatives at commit), for the
 * stories that don't go through the teacher's routes. Default: an ASSIGNMENT published a day ago,
 * due in a week, REJECT. An EXERCISE has no grade, deadline or late policy, and each question
 * carries a bank exercise with its difficulty and points (013 K1, K2).
 */
export async function createActivity(
  t: TestApp,
  schoolClass: Pick<SchoolClass, "id" | "teacherId">,
  options: CreateActivityOptions = {},
): Promise<CreatedActivity> {
  const now = Date.now();
  const type = options.type ?? "ASSIGNMENT";
  const exercise = type === "EXERCISE";
  const specs = options.questions ?? [{ type: "MULTIPLE_CHOICE" as const }];
  const values = specs.map((spec) => spec.valueCents ?? 100);
  const totalCents = values.reduce((sum, value) => sum + value, 0);
  const java = specs.some((spec) => spec.type === "CODE") ? await languageId(t, "java") : null;
  const status = options.status ?? "ACTIVE";
  let sourceWorkId = options.sourceWorkId ?? null;
  let sourceSubjectId = options.sourceSubjectId ?? null;
  if (!exercise && sourceWorkId === null) {
    const work = await createWork(t, schoolClass.teacherId, sourceSubjectId ? { subjectId: sourceSubjectId } : {});
    sourceWorkId = work.id;
    sourceSubjectId = work.subjectId;
  }
  const sourceExerciseIds: (string | null)[] = [];
  for (const spec of specs) {
    sourceExerciseIds.push(
      exercise
        ? (spec.sourceExerciseId ?? (await createExercise(t, schoolClass.teacherId, { type: spec.type, difficulty: spec.difficulty ?? "BASIC" })).id)
        : null,
    );
  }

  return t.prisma.$transaction(async (tx) => {
    const activity = await tx.classActivity.create({
      data: {
        classId: schoolClass.id,
        teacherId: schoolClass.teacherId,
        type,
        status,
        title: options.title ?? "Atividade de teste",
        instructions: options.instructions ?? null,
        totalGrade: exercise ? null : cents(totalCents),
        questionCount: specs.length,
        publishAt: options.publishAt ?? new Date(now - 24 * 3_600_000),
        deadline: exercise ? null : (options.deadline ?? new Date(now + 7 * 24 * 3_600_000)),
        latePolicy: exercise ? null : (options.latePolicy ?? "REJECT"),
        sourceWorkId,
        sourceSubjectId,
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
          value: exercise ? null : cents(values[position]!),
          difficulty: exercise ? (spec.difficulty ?? "BASIC") : null,
          points: exercise ? EXERCISE_POINTS[spec.difficulty ?? "BASIC"] : null,
          sourceExerciseId: sourceExerciseIds[position],
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

export interface SubmissionRowOptions {
  submittedAt?: Date;
  late?: boolean;
  /** Integer hundredths; default 0. */
  gradeCents?: number;
  /** Default false: every question graded. */
  gradePartial?: boolean;
  generalFeedback?: string | null;
  blankCount?: number;
  /** FR-006b: the teacher who accepted it (the submission is then late). */
  acceptedById?: string;
}

/**
 * An attempt of `studentUserId` written straight to the database (012 US2, T026): IN_PROGRESS, or
 * SUBMITTED with its submission when `submission` is given (ASSIGNMENT). An EXERCISE attempt takes
 * its `number` and, concluded, `completedAt` instead of a submission (013 K3); the numbering trigger
 * needs attempt n − 1 concluded first.
 */
export async function createAttemptRow(
  t: TestApp,
  activityId: string,
  studentUserId: string,
  options: { startedAt?: Date; submission?: SubmissionRowOptions; number?: number; completedAt?: Date } = {},
): Promise<{ attemptId: string; submissionId: string | null }> {
  const startedAt = options.startedAt ?? new Date();
  const concluded = Boolean(options.submission || options.completedAt);
  const attempt = await t.prisma.activityAttempt.create({
    data: {
      activityId,
      studentUserId,
      number: options.number ?? 1,
      startedAt,
      status: concluded ? "SUBMITTED" : "IN_PROGRESS",
      completedAt: options.completedAt ?? null,
    },
  });
  if (!options.submission) return { attemptId: attempt.id, submissionId: null };
  const submission = options.submission;
  const created = await t.prisma.activitySubmission.create({
    data: {
      attemptId: attempt.id,
      activityId,
      studentUserId,
      submittedAt: submission.submittedAt ?? startedAt,
      late: submission.late ?? Boolean(submission.acceptedById),
      blankCount: submission.blankCount ?? 0,
      acceptedById: submission.acceptedById ?? null,
      grade: cents(submission.gradeCents ?? 0),
      gradePartial: submission.gradePartial ?? false,
      generalFeedback: submission.generalFeedback ?? null,
    },
  });
  return { attemptId: attempt.id, submissionId: created.id };
}
