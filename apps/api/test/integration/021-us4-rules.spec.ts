import type { Answer, StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { RateLimitService } from "../../src/platform/rate-limit/rate-limit.service";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { createClassWithStudents, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { declareExit, getMyPause, markPresent, releasePause } from "../helpers/attendance";
import { DAY, FixedClock, MINUTE } from "../helpers/clock";
import { asRun, createCodeExercise, createCodeWork, createRunWorker, doubles, getLatestRun, getRun, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";
import { createWorkHelpApp, requestHelp, scriptHelp, validGuidance } from "../helpers/work-help";

type Client = ReturnType<typeof api>;

/**
 * 021/US4 (research Y4, Y6): a run on a work is accepted only when a save would be — the attempt in
 * progress, the 012 deadline rule, the activity active and the student released (016), the attempt not
 * paused — so running never gets around 012, 015 or 016. A refusal creates no `code_runs` row; a run
 * already pending ends in a final state without touching the attempt, the answer or the pause. The
 * work goes on as before with no runner (the AI help needs the work-help app).
 */
describe("021/US4 a execução respeita a tentativa, a pausa e o prazo", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let students: TestUser[];
  let student: Client;
  let schoolClass: SchoolClass;
  let worker: CodeRunWorker;

  const code = (source: string): Answer => ({ kind: "CODE", source });
  const view = async (activityId: string) => {
    const res = await student.get(`/api/me/activities/${activityId}`);
    expect(res.status).toBe(200);
    return res.body as StudentActivity;
  };
  const accepted = async (activityId: string, questionId: string) => {
    const res = await requestRun(student, activityId, questionId);
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    return asRun(res.body);
  };
  /** A PRESENT_ONLY work the student is marked present in and has started. */
  const startedPresentWork = async () => {
    const work = await createCodeWork(t, schoolClass, { releaseMode: "PRESENT_ONLY" });
    expect((await markPresent(teacherClient, schoolClass.id, work.activity.id, [students[0]!.id])).status).toBe(200);
    expect((await startAttempt(student, work.activity.id)).status).toBe(200);
    return { work, activityId: work.activity.id, questionId: work.questionIds[0]! };
  };
  const exitRoom = async (activityId: string) => {
    expect((await declareExit(student, activityId, { reason: "BATHROOM" })).status).toBe(201);
    return ((await getMyPause(student, activityId)).body.pause as { id: string }).id;
  };

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
    ({ worker } = createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }));
  });

  it("021/US4-1 pausa aberta: 409 ATTEMPT_PAUSED, sem execução criada e com attempt_pause.write_refused; latest e get também 409; liberada, aceita", async () => {
    const { activityId, questionId } = await startedPresentWork();
    const before = await accepted(activityId, questionId);
    expect(await worker.runOnce()).toBe(1);
    const pauseId = await exitRoom(activityId);

    const paused = await requestRun(student, activityId, questionId);
    expect([paused.status, paused.body.code], JSON.stringify(paused.body)).toEqual([409, "ATTEMPT_PAUSED"]);
    expect(await t.prisma.codeRun.count()).toBe(1);
    const refused = await t.prisma.auditEvent.findMany({ where: { type: "attempt_pause.write_refused" } });
    expect(refused.map((event) => event.metadata)).toEqual([{ activityId, pauseId, operation: "CODE_RUN" }]);
    // A read carries the student's program and outputs: none while out of the room (no audit for a read).
    for (const res of [await getLatestRun(student, activityId, questionId), await getRun(student, before.id)]) {
      expect([res.status, res.body.code]).toEqual([409, "ATTEMPT_PAUSED"]);
    }
    expect(await t.prisma.auditEvent.count({ where: { type: "attempt_pause.write_refused" } })).toBe(1);

    expect((await releasePause(teacherClient, schoolClass.id, activityId, pauseId)).status).toBe(200);
    expect(asRun((await getLatestRun(student, activityId, questionId)).body.run).id).toBe(before.id);
    await accepted(activityId, questionId);
  });

  it("021/US4-2 sem tentativa ou entregue: 409 ATTEMPT_NOT_IN_PROGRESS sem execução; latest vazio e get de uma execução da tentativa → 404", async () => {
    const work = await createCodeWork(t, schoolClass);
    const [activityId, questionId] = [work.activity.id, work.questionIds[0]!];
    const notStarted = await requestRun(student, activityId, questionId);
    expect([notStarted.status, notStarted.body.code]).toEqual([409, "ATTEMPT_NOT_IN_PROGRESS"]);
    expect((await getLatestRun(student, activityId, questionId)).body).toEqual({ run: null });

    expect((await startAttempt(student, activityId)).status).toBe(200);
    const run = await accepted(activityId, questionId);
    expect(await worker.runOnce()).toBe(1);
    expect((await getRun(student, run.id)).status).toBe(200);
    expect((await submitAttempt(student, activityId)).status).toBe(200);

    const submitted = await requestRun(student, activityId, questionId);
    expect([submitted.status, submitted.body.code]).toEqual([409, "ATTEMPT_NOT_IN_PROGRESS"]);
    expect((await getLatestRun(student, activityId, questionId)).body).toEqual({ run: null });
    expect((await getRun(student, run.id)).status).toBe(404);
    expect(await t.prisma.codeRun.count()).toBe(1);
  });

  it("021/US4-3 prazo passado em REJECT: executar é recusado com o mesmo código do salvamento, sem execução criada; latest ainda mostra a última", async () => {
    const work = await createCodeWork(t, schoolClass, { latePolicy: "REJECT" });
    const [activityId, questionId] = [work.activity.id, work.questionIds[0]!];
    expect((await startAttempt(student, activityId)).status).toBe(200);
    const last = await accepted(activityId, questionId);
    expect(await worker.runOnce()).toBe(1);
    clock.set(new Date(work.activity.deadline!.getTime() + MINUTE));
    await seedHeartbeat(t, clock.now());

    const save = await saveAnswers(student, activityId, [{ questionId, answer: code("x"), baseRevision: 0 }]);
    expect(save.status).toBe(409);
    const run = await requestRun(student, activityId, questionId);
    expect([run.status, run.body.code], JSON.stringify(run.body)).toEqual([save.status, save.body.code]);
    expect(await t.prisma.codeRun.count()).toBe(1);
    expect(asRun((await getLatestRun(student, activityId, questionId)).body.run).id).toBe(last.id);
    expect((await getRun(student, last.id)).status).toBe(200);
  });

  it("021/US4-3 prazo passado em ACCEPT_MARKED com a tentativa aberta: salvar e executar continuam aceitos", async () => {
    const work = await createCodeWork(t, schoolClass, { latePolicy: "ACCEPT_MARKED" });
    const [activityId, questionId] = [work.activity.id, work.questionIds[0]!];
    expect((await startAttempt(student, activityId)).status).toBe(200);
    clock.set(new Date(work.activity.deadline!.getTime() + DAY));
    await seedHeartbeat(t, clock.now());
    expect((await saveAnswers(student, activityId, [{ questionId, answer: code("x"), baseRevision: 0 }])).status).toBe(200);
    await accepted(activityId, questionId);
  });

  it("021/US4-4 atividade encerrada ou cancelada, aluno não marcado presente: 404 como as demais rotas, sem execução", async () => {
    for (const status of ["CLOSED", "CANCELLED"] as const) {
      const work = await createCodeWork(t, schoolClass);
      expect((await startAttempt(student, work.activity.id)).status).toBe(200);
      await t.prisma.classActivity.update({
        where: { id: work.activity.id },
        data: { status, ...(status === "CLOSED" ? { closedAt: clock.now() } : { cancelledAt: clock.now() }) },
      });
      for (const res of [await requestRun(student, work.activity.id, work.questionIds[0]!), await getLatestRun(student, work.activity.id, work.questionIds[0]!)]) {
        expect(res.status, status).toBe(404);
      }
    }
    const absent = await createCodeWork(t, schoolClass, { releaseMode: "PRESENT_ONLY" });
    expect((await requestRun(student, absent.activity.id, absent.questionIds[0]!)).status).toBe(404);
    expect(await t.prisma.codeRun.count()).toBe(0);
    const denied = await t.prisma.auditEvent.findMany({ where: { type: "student_access.denied" }, orderBy: { id: "asc" } });
    expect(denied.map((event) => (event.metadata as { reason: string }).reason)).toEqual(["CANCELLED", "CANCELLED", "NOT_PRESENT"]);
  });

  it("021/US4-5 a pendente e o limite por minuto são um só para Exercícios e Trabalhos", async () => {
    const work = await createCodeWork(t, schoolClass);
    const exercise = await createCodeExercise(t, schoolClass);
    expect((await startAttempt(student, work.activity.id)).status).toBe(200);
    expect((await startAttempt(student, exercise.activity.id)).status).toBe(200);
    const pending = await accepted(exercise.activity.id, exercise.questionIds[0]!);
    const again = await requestRun(student, work.activity.id, work.questionIds[0]!);
    expect([again.status, again.body.id]).toEqual([200, pending.id]);
    expect(await worker.runOnce()).toBe(1);

    const limit = t.config.rateLimit.codeRunsPerMinute;
    await t.get(RateLimitService).hit("code-runs", students[0]!.id, { limit, windowSec: 60, weight: limit - 1 });
    expect((await requestRun(student, work.activity.id, work.questionIds[0]!)).status).toBe(429);
    expect(await t.prisma.codeRun.count()).toBe(1);
  });

  it("021/US4-6 sem worker ou com a execução desligada: Execução indisponível, e salvar, ajuda da IA, pausa e entrega seguem a 012/015/016", async () => {
    const work = await createCodeWork(t, schoolClass, { releaseMode: "PRESENT_ONLY", aiHelpAllowance: 3 });
    const [activityId, questionId] = [work.activity.id, work.questionIds[0]!];
    await t.prisma.codeRunnerHeartbeat.deleteMany();
    expect((await markPresent(teacherClient, schoolClass.id, activityId, [students[0]!.id])).status).toBe(200);
    expect((await startAttempt(student, activityId)).status).toBe(200);
    expect((await view(activityId)).questions[0]!.execution).toMatchObject({ status: "UNAVAILABLE" });
    expect((await requestRun(student, activityId, questionId)).body.code).toBe("CODE_RUNNER_UNAVAILABLE");

    const config = t.config.codeRunner;
    Object.assign(t.config, { codeRunner: { ...config, enabled: false } });
    try {
      await seedHeartbeat(t, clock.now());
      expect((await view(activityId)).questions[0]!.execution).toMatchObject({ status: "UNAVAILABLE" });
      expect((await saveAnswers(student, activityId, [{ questionId, answer: code("resposta"), baseRevision: 0 }])).status).toBe(200);
      const help = await requestHelp(student, activityId, { questionId, question: "Como leio a entrada?" });
      expect(help.status, JSON.stringify(help.body)).toBe(202);
      scriptHelp(t.provider, help.body.id, validGuidance());
      await drain(t);
      const pauseId = await exitRoom(activityId);
      expect((await releasePause(teacherClient, schoolClass.id, activityId, pauseId)).status).toBe(200);
      expect((await submitAttempt(student, activityId)).status).toBe(200);
    } finally {
      Object.assign(t.config, { codeRunner: config });
    }
    expect(await t.prisma.workHelpRequest.count({ where: { status: "DELIVERED" } })).toBe(1);
    expect(await t.prisma.codeRun.count()).toBe(0);
  });

  it("021/US4-7 execução pendente quando a tentativa é pausada, entregue ou a atividade encerrada: termina num estado final e nada mais muda", async () => {
    for (const situation of ["PAUSED", "SUBMITTED", "CLOSED"] as const) {
      const { activityId, questionId } = await startedPresentWork();
      expect((await saveAnswers(student, activityId, [{ questionId, answer: code("salva"), baseRevision: 0 }])).status).toBe(200);
      const run = await accepted(activityId, questionId);
      if (situation === "PAUSED") await exitRoom(activityId);
      if (situation === "SUBMITTED") expect((await submitAttempt(student, activityId)).status).toBe(200);
      if (situation === "CLOSED") await t.prisma.classActivity.update({ where: { id: activityId }, data: { status: "CLOSED", closedAt: clock.now() } });
      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId }, include: { answers: true, pauses: true } });

      expect(await worker.runOnce(), situation).toBe(1);
      const final = await t.prisma.codeRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(["COMPLETED", "FAILED"], situation).toContain(final.status);
      expect(await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId }, include: { answers: true, pauses: true } }), situation).toEqual(attempt);
      clock.advance(MINUTE);
      await seedHeartbeat(t, clock.now());
    }
  });
});
