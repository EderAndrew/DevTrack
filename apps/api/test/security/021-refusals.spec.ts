import type { Answer, TeacherAttempt } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { createActivity, createClassWithStudents, getAttempt, gradeAttempt, releaseResult, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { declareExit, getMyPause, markPresent, pauseStudent, releasePause } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createCodeWork, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api } from "../helpers/test-app";
import { createWorkHelpApp, requestHelp, scriptHelp, validGuidance } from "../helpers/work-help";

type Client = ReturnType<typeof api>;

/**
 * 021/SC-004: every situation where a save would be refused or the work is outside the student's
 * context refuses a run too, and none leaves a `code_runs` row. 021/SC-007: with the execution off,
 * a work's whole flow (012, 015, 016) works exactly as before.
 */
describe("021/SC-004 021/SC-007 recusas da execução num trabalho e o trabalho sem execução", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let students: TestUser[];
  let student: Client;
  let schoolClass: SchoolClass;

  const code = (source: string): Answer => ({ kind: "CODE", source });

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createWorkHelpApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = created.schoolClass;
    students = created.students;
    student = api(t, { cookie: await loginAs(t, students[0]!) });
    await seedHeartbeat(t, clock.now());
  });

  /** Each situation builds its activity and returns the run's route ids and the expected refusal. */
  const situations: Record<string, () => Promise<{ activityId: string; questionId: string; expected: [number, string | undefined] }>> = {
    "sem a opção": async () => {
      const work = await createCodeWork(t, schoolClass, { codeExecutionAllowed: false });
      await startAttempt(student, work.activity.id);
      return { activityId: work.activity.id, questionId: work.questionIds[0]!, expected: [404, "NOT_FOUND"] };
    },
    Prova: async () => {
      const exam = await createActivity(t, schoolClass, { type: "EXAM", questions: [{ type: "CODE", languageKey: "python", testCases: [{ input: "1", expectedOutput: "2", visibility: "PUBLIC" }] }] });
      return { activityId: exam.activity.id, questionId: exam.questionIds[0]!, expected: [404, "NOT_FOUND"] };
    },
    pausada: async () => {
      const work = await createCodeWork(t, schoolClass, { releaseMode: "PRESENT_ONLY" });
      await markPresent(teacherClient, schoolClass.id, work.activity.id, [students[0]!.id]);
      await startAttempt(student, work.activity.id);
      await declareExit(student, work.activity.id, { reason: "WATER" });
      return { activityId: work.activity.id, questionId: work.questionIds[0]!, expected: [409, "ATTEMPT_PAUSED"] };
    },
    entregue: async () => {
      const work = await createCodeWork(t, schoolClass);
      await startAttempt(student, work.activity.id);
      await submitAttempt(student, work.activity.id);
      return { activityId: work.activity.id, questionId: work.questionIds[0]!, expected: [409, "ATTEMPT_NOT_IN_PROGRESS"] };
    },
    "prazo em REJECT": async () => {
      const work = await createCodeWork(t, schoolClass, { latePolicy: "REJECT", deadline: new Date(clock.now().getTime() + MINUTE) });
      await startAttempt(student, work.activity.id);
      clock.advance(2 * MINUTE);
      await seedHeartbeat(t, clock.now());
      return { activityId: work.activity.id, questionId: work.questionIds[0]!, expected: [409, "DEADLINE_PASSED"] };
    },
    encerrada: async () => {
      const work = await createCodeWork(t, schoolClass);
      await startAttempt(student, work.activity.id);
      await t.prisma.classActivity.update({ where: { id: work.activity.id }, data: { status: "CLOSED", closedAt: clock.now() } });
      return { activityId: work.activity.id, questionId: work.questionIds[0]!, expected: [404, "NOT_FOUND"] };
    },
    cancelada: async () => {
      const work = await createCodeWork(t, schoolClass);
      await startAttempt(student, work.activity.id);
      await t.prisma.classActivity.update({ where: { id: work.activity.id }, data: { status: "CANCELLED", cancelledAt: clock.now() } });
      return { activityId: work.activity.id, questionId: work.questionIds[0]!, expected: [404, "NOT_FOUND"] };
    },
    "outra turma": async () => {
      const otherTeacher = await createUser(t, { roles: ["TEACHER"] });
      const other = await createClassWithStudents(t, otherTeacher.id, { students: 1 });
      const work = await createCodeWork(t, other.schoolClass);
      return { activityId: work.activity.id, questionId: work.questionIds[0]!, expected: [404, "NOT_FOUND"] };
    },
  };

  for (const [name, build] of Object.entries(situations)) {
    it(`021/SC-004 ${name}: a execução é recusada e nenhuma linha de code_runs é criada`, async () => {
      const { activityId, questionId, expected } = await build();
      const res = await requestRun(student, activityId, questionId);
      expect([res.status, res.body.code], JSON.stringify(res.body)).toEqual(expected);
      expect(await t.prisma.codeRun.count()).toBe(0);
    });
  }

  it("021/SC-007 com a execução desligada: responder, salvar, CONTROLADO, ajuda da IA, chamada e pausa, entregar, corrigir e liberar", async () => {
    const config = t.config.codeRunner;
    Object.assign(t.config, { codeRunner: { ...config, enabled: false } });
    try {
      const work = await createCodeWork(t, schoolClass, { executionMode: "CONTROLLED", aiHelpAllowance: 3, releaseMode: "PRESENT_ONLY" });
      const [activityId, codeId, choiceId] = [work.activity.id, work.questionIds[0]!, work.questionIds[1]!];
      expect((await markPresent(teacherClient, schoolClass.id, activityId, [students[0]!.id])).status).toBe(200);
      const started = await startAttempt(student, activityId);
      expect(started.status).toBe(200);
      expect(started.body.questions[0].execution).toMatchObject({ status: "UNAVAILABLE" });

      expect((await saveAnswers(student, activityId, [{ questionId: codeId, answer: code("print(1)"), baseRevision: 0 }])).status).toBe(200);
      expect((await recordEvents(student, activityId, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
      const help = await requestHelp(student, activityId, { questionId: codeId, question: "Como leio a entrada?" });
      expect(help.status, JSON.stringify(help.body)).toBe(202);
      scriptHelp(t.provider, help.body.id, validGuidance());
      await drain(t);

      expect((await declareExit(student, activityId, { reason: "WATER" })).status).toBe(201);
      const pauseId = ((await getMyPause(student, activityId)).body.pause as { id: string }).id;
      expect((await releasePause(teacherClient, schoolClass.id, activityId, pauseId)).status).toBe(200);
      expect((await pauseStudent(teacherClient, schoolClass.id, activityId, students[0]!.id)).status).toBe(201);
      const teacherPause = ((await getMyPause(student, activityId)).body.pause as { id: string }).id;
      expect((await releasePause(teacherClient, schoolClass.id, activityId, teacherPause)).status).toBe(200);

      const submitted = await submitAttempt(student, activityId, [{ questionId: choiceId, answer: { kind: "ALTERNATIVE", alternativeId: work.correctAlternativeIds[1]! }, baseRevision: 0 }]);
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId } });
      const review = (await getAttempt(teacherClient, schoolClass.id, activityId, attempt.id)).body as TeacherAttempt;
      expect(review.answers.find((answer) => answer.questionId === codeId)!.answer).toEqual(code("print(1)"));
      const graded = await gradeAttempt(teacherClient, schoolClass.id, activityId, attempt.id, { version: review.submission!.version, decisions: [{ questionId: codeId, grade: "0.00" }] });
      expect(graded.status, JSON.stringify(graded.body)).toBe(200);
      expect((await releaseResult(teacherClient, schoolClass.id, activityId)).status).toBe(200);
      expect((await student.get(`/api/me/activities/${activityId}`)).body.result).not.toBeNull();
    } finally {
      Object.assign(t.config, { codeRunner: config });
    }
    expect(await t.prisma.workHelpRequest.count({ where: { status: "DELIVERED" } })).toBe(1);
    expect(await t.prisma.attemptIntegrityEvent.count()).toBeGreaterThan(0);
    expect(await t.prisma.codeRun.count()).toBe(0);
  });
});
