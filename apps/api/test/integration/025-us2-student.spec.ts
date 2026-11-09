import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { pauseStudent, releasePause } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { dismissNudge, getStudentNudge, type NudgeScene, nudgeScene, occur, sendNudge, studentNudgePath } from "../helpers/exam-nudges";
import { decideHold } from "../helpers/exams";
import { createEnrollment, createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 025/US2 (research N7, contracts/http-api.md, contracts/audit-events.md): the exam page's poll answers the pending
 * warning of the own attempt only while it runs, with the student's own name from the server; "Entendi" closes it
 * once with the server's time and `exam_nudge.dismissed`; paused, held and ended attempts answer the 018 codes.
 */
describe("025/US2 o aluno vê o aviso, fecha e continua a prova", () => {
  let t: TestApp;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
  });

  const dismissedEvents = () => t.prisma.auditEvent.findMany({ where: { type: "exam_nudge.dismissed" } });
  const teacherWeb = async (scene: NudgeScene) => api(t, { cookie: await loginAs(t, scene.teacher) });

  /** A scene whose student has a warning sent through the app's bell. */
  const withNudge = async (options: Parameters<typeof nudgeScene>[2] = {}) => {
    const scene = await nudgeScene(t, clock, options);
    const sent = await sendNudge(t, scene);
    expect(sent.status, JSON.stringify(sent.body)).toBe(201);
    return { scene, nudgeId: sent.body.nudge.id as string };
  };

  const polled = async (scene: NudgeScene) => {
    const res = await getStudentNudge(scene.studentClient, scene.activityId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body;
  };

  const refused = async (scene: NudgeScene, nudgeId: string) => {
    const res = await dismissNudge(scene.studentClient, scene.activityId, nudgeId);
    return [res.status, res.body.code];
  };

  it("025/US2-1 025/FR-009 a consulta traz o aviso pendente com o nome da conta do aluno, e só essas chaves", async () => {
    const scene = await nudgeScene(t, clock);
    expect(await polled(scene)).toEqual({ nudge: null });
    const sent = await sendNudge(t, scene);
    const body = await polled(scene);
    expect(body).toEqual({ nudge: { id: sent.body.nudge.id, studentName: scene.student.name } });
    expect(Object.keys(body.nudge)).toEqual(["id", "studentName"]);
    // A read: nothing written.
    expect(await t.prisma.auditEvent.count({ where: { type: { in: ["exam_nudge.dismissed", "student_access.denied"] } } })).toBe(0);
  });

  it("025/US2-2 025/US2-3 Entendi fecha com o horário do servidor e exam_nudge.dismissed; repetir é 200 sem segundo evento", async () => {
    const { scene, nudgeId } = await withNudge();
    clock.advance(7_000);
    const res = await dismissNudge(scene.studentClient, scene.activityId, nudgeId);
    expect([res.status, res.body]).toEqual([200, { nudge: null }]);
    const dismissedAt = clock.now();
    expect((await t.prisma.examNudge.findUniqueOrThrow({ where: { id: nudgeId } })).dismissedAt).toEqual(dismissedAt);
    const events = await dismissedEvents();
    expect(events.map((event) => [event.actorType, event.actorUserId, event.targetType, event.targetId, event.metadata])).toEqual([
      ["USER", scene.student.id, "ACTIVITY_ATTEMPT", scene.attemptId, { activityId: scene.activityId, nudgeId }],
    ]);

    clock.advance(5_000);
    const again = await dismissNudge(scene.studentClient, scene.activityId, nudgeId);
    expect([again.status, again.body]).toEqual([200, { nudge: null }]);
    expect(await dismissedEvents()).toHaveLength(1);
    expect((await t.prisma.examNudge.findUniqueOrThrow({ where: { id: nudgeId } })).dismissedAt).toEqual(dismissedAt);
    expect(await polled(scene)).toEqual({ nudge: null });
  });

  describe("025/US2-6 pausada ou retida: não aparece e o fechamento é recusado; volta quando a prova volta", () => {
    it("025/US2-6 pausada → null e 409 ATTEMPT_PAUSED; liberado o retorno, o aviso volta", async () => {
      const { scene, nudgeId } = await withNudge();
      const teacher = await teacherWeb(scene);
      const paused = await pauseStudent(teacher, scene.classId, scene.activityId, scene.student.id);
      expect(paused.status, JSON.stringify(paused.body)).toBe(201);
      expect(await polled(scene)).toEqual({ nudge: null });
      expect(await refused(scene, nudgeId)).toEqual([409, "ATTEMPT_PAUSED"]);

      const pause = await t.prisma.attemptPause.findFirstOrThrow({ where: { attemptId: scene.attemptId, releasedAt: null } });
      expect((await releasePause(teacher, scene.classId, scene.activityId, pause.id)).status).toBe(200);
      expect((await polled(scene)).nudge).toEqual({ id: nudgeId, studentName: scene.student.name });
      expect(await dismissedEvents()).toEqual([]);
    });

    it("025/US2-6 retida → null e 409 EXAM_ATTEMPT_ON_HOLD; devolvida, o aviso volta", async () => {
      const { scene, nudgeId } = await withNudge();
      await occur(clock, scene, 2);
      const hold = await t.prisma.examAttemptHold.findFirstOrThrow({ where: { attemptId: scene.attemptId, resolution: null } });
      expect(await polled(scene)).toEqual({ nudge: null });
      expect(await refused(scene, nudgeId)).toEqual([409, "EXAM_ATTEMPT_ON_HOLD"]);

      const returned = await decideHold(await teacherWeb(scene), scene.classId, scene.activityId, hold.id, "return");
      expect(returned.status, JSON.stringify(returned.body)).toBe(200);
      expect((await polled(scene)).nudge).toEqual({ id: nudgeId, studentName: scene.student.name });
      expect(await dismissedEvents()).toEqual([]);
    });
  });

  describe("025/US2-7 tentativa terminada: nunca mostrado e o fechamento é 409 EXAM_NUDGE_NOT_PENDING", () => {
    const expectEnded = async (scene: NudgeScene, nudgeId: string) => {
      expect(await polled(scene)).toEqual({ nudge: null });
      expect(await refused(scene, nudgeId)).toEqual([409, "EXAM_NUDGE_NOT_PENDING"]);
      expect((await t.prisma.examNudge.findUniqueOrThrow({ where: { id: nudgeId } })).dismissedAt).toBeNull();
      expect(await dismissedEvents()).toEqual([]);
    };

    it("025/US2-7 entregue", async () => {
      const { scene, nudgeId } = await withNudge();
      const submitted = await scene.studentClient.post(`/api/me/activities/${scene.activityId}/attempt/submit`, { answers: [] });
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
      await expectEnded(scene, nudgeId);
    });

    it("025/US2-7 tempo esgotado (a consulta liquida a tentativa)", async () => {
      const { scene, nudgeId } = await withNudge();
      clock.advance(61 * MINUTE);
      await expectEnded(scene, nudgeId);
      expect(await t.prisma.activitySubmission.findUnique({ where: { attemptId: scene.attemptId } })).toMatchObject({ endReason: "TIME_EXPIRED" });
    });

    it("025/US2-7 cancelada pelo professor na retenção", async () => {
      const { scene, nudgeId } = await withNudge();
      await occur(clock, scene, 2);
      const hold = await t.prisma.examAttemptHold.findFirstOrThrow({ where: { attemptId: scene.attemptId, resolution: null } });
      expect((await decideHold(await teacherWeb(scene), scene.classId, scene.activityId, hold.id, "cancel")).status).toBe(200);
      await expectEnded(scene, nudgeId);
    });

    it("025/US2-7 prova encerrada pelo professor", async () => {
      const { scene, nudgeId } = await withNudge();
      const closed = await (await teacherWeb(scene)).post(`/api/classes/${scene.classId}/activities/${scene.activityId}/close`, {});
      expect(closed.status, JSON.stringify(closed.body)).toBe(200);
      await expectEnded(scene, nudgeId);
    });
  });

  it("025/US2-9 025/FR-014 outro aluno da mesma prova não recebe nada e não fecha o aviso alheio (404)", async () => {
    const { scene, nudgeId } = await withNudge({ classmates: 1 });
    const classmate = scene.classmates[0]!;
    const theirs = await getStudentNudge(classmate.client, scene.activityId);
    expect([theirs.status, theirs.body]).toEqual([200, { nudge: null }]);
    const res = await dismissNudge(classmate.client, scene.activityId, nudgeId);
    expect([res.status, res.body.code]).toEqual([404, "NOT_FOUND"]);
    expect((await t.prisma.examNudge.findUniqueOrThrow({ where: { id: nudgeId } })).dismissedAt).toBeNull();
    expect((await polled(scene)).nudge?.id).toBe(nudgeId);
  });

  it("aluno não marcado presente, sem tentativa, trabalho e exercício → 404 como as rotas de aluno da 018", async () => {
    const { scene, nudgeId } = await withNudge();
    // Enrolled, but not marked present: 404 and student_access.denied (NOT_PRESENT).
    const absent = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, scene.classId, absent.id);
    const absentClient = api(t, { cookie: await loginAs(t, absent) });
    for (const res of [await getStudentNudge(absentClient, scene.activityId), await dismissNudge(absentClient, scene.activityId, nudgeId)]) {
      expect([res.status, res.body.code]).toEqual([404, "NOT_FOUND"]);
    }
    const denied = await t.prisma.auditEvent.findMany({ where: { type: "student_access.denied", actorUserId: absent.id } });
    expect(denied.map((event) => event.metadata)).toEqual([
      { route: "/me/activities/:activityId/attempt/exam-nudge", reason: "NOT_PRESENT" },
      { route: "/me/activities/:activityId/attempt/exam-nudge/:nudgeId/dismiss", reason: "NOT_PRESENT" },
    ]);

    // Present, but not started: 404.
    await t.prisma.activityAttendance.create({
      data: { activityId: scene.activityId, studentUserId: absent.id, classId: scene.classId, markedAt: clock.now(), markedById: scene.teacher.id },
    });
    expect((await getStudentNudge(absentClient, scene.activityId)).status).toBe(404);

    // A work and an exercise of the student's class: 404.
    const own = await createClassWithStudents(t, scene.teacher.id, { students: 1 });
    const student = api(t, { cookie: await loginAs(t, own.students[0]!) });
    for (const options of [{ executionMode: "CONTROLLED" as const }, { type: "EXERCISE" as const }]) {
      const { activity } = await createActivity(t, own.schoolClass, options);
      await createAttemptRow(t, activity.id, own.students[0]!.id);
      for (const res of [await getStudentNudge(student, activity.id), await dismissNudge(student, activity.id, nudgeId)]) {
        expect([JSON.stringify(options), res.status, res.body.code]).toEqual([JSON.stringify(options), 404, "NOT_FOUND"]);
      }
    }
    expect((await t.prisma.examNudge.findUniqueOrThrow({ where: { id: nudgeId } })).dismissedAt).toBeNull();
  });

  it("as rotas do aluno são só do web: o bearer do app → 403 MOBILE_ROUTE_NOT_ALLOWED; outros papéis → 403", async () => {
    const { scene, nudgeId } = await withNudge();
    // With the allowed Origin and JSON, so only the session guard decides (as 024-mobile-allowlist.spec.ts).
    const app = api(t, { bearer: scene.token });
    for (const res of [await app.get(studentNudgePath(scene.activityId)), await app.post(`${studentNudgePath(scene.activityId)}/${nudgeId}/dismiss`, {})]) {
      expect([res.status, res.body.code]).toEqual([403, "MOBILE_ROUTE_NOT_ALLOWED"]);
    }
    const teacher = await teacherWeb(scene);
    for (const res of [await getStudentNudge(teacher, scene.activityId), await dismissNudge(teacher, scene.activityId, nudgeId)]) {
      expect([res.status, res.body.code]).toEqual([403, "FORBIDDEN"]);
    }
    expect((await t.prisma.examNudge.findUniqueOrThrow({ where: { id: nudgeId } })).dismissedAt).toBeNull();
  });

  it("025/FR-006 o corpo do fechamento é exatamente {}: horário, aluno ou id extra → 400, nada muda", async () => {
    const { scene, nudgeId } = await withNudge();
    for (const body of [{ dismissedAt: clock.now().toISOString() }, { studentId: scene.student.id }, { nudgeId }]) {
      const res = await dismissNudge(scene.studentClient, scene.activityId, nudgeId, body);
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
    }
    const bad = await dismissNudge(scene.studentClient, scene.activityId, "nao-e-um-id");
    expect(bad.status).toBe(400);
    expect((await t.prisma.examNudge.findUniqueOrThrow({ where: { id: nudgeId } })).dismissedAt).toBeNull();
    expect(await dismissedEvents()).toEqual([]);
  });
});
