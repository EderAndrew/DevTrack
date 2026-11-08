import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { pauseStudent } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createNudge, dismissByHand, type NudgeScene, nudgeScene, nudgesPath, occur, roomRow, sendNudge } from "../helpers/exam-nudges";
import { createUser, loginAs } from "../helpers/factories";
import { mobileApi, openMobileSession } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 025/US1 (research N3, N5, contracts/http-api.md, contracts/audit-events.md): the bell lights up for a running
 * attempt with 2+ counted occurrences and no pending warning; the send from the app creates one pending warning,
 * idempotently, refuses an attempt that is not running, and never touches the exam's record.
 */
describe("025/US1 o professor envia o aviso pelo sino no celular", () => {
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

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { occurredAt: "asc" } });
  const nudges = (scene: NudgeScene) => t.prisma.examNudge.findMany({ where: { attemptId: scene.attemptId } });
  const teacherWeb = async (scene: NudgeScene) => api(t, { cookie: await loginAs(t, scene.teacher) });

  /** The send refused with 409 and its `exam_nudge.send_refused` with the reason; nothing created. */
  const expectRefused = async (scene: NudgeScene, reason: string) => {
    const before = (await events("exam_nudge.send_refused")).length;
    const res = await sendNudge(t, scene);
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe("EXAM_NUDGE_NOT_ALLOWED");
    const refused = await events("exam_nudge.send_refused");
    expect(refused).toHaveLength(before + 1);
    expect(refused.at(-1)).toMatchObject({
      actorType: "USER",
      actorUserId: scene.teacher.id,
      targetType: "ACTIVITY_ATTEMPT",
      targetId: scene.attemptId,
      metadata: { activityId: scene.activityId, reason },
    });
    expect(await nudges(scene)).toEqual([]);
  };

  describe("o sino na sala", () => {
    it("025/US1-1 025/US1-2 o sino só acende a partir de 2 ocorrências contadas", async () => {
      const scene = await nudgeScene(t, clock, { occurrences: 1 });
      expect((await roomRow(t, scene)).nudge).toEqual({ canSend: false, pendingSince: null, sentCount: 0, lastDismissedAt: null });
      await occur(clock, scene);
      expect((await roomRow(t, scene)).nudge).toEqual({ canSend: true, pendingSince: null, sentCount: 0, lastDismissedAt: null });
      await occur(clock, scene);
      expect((await roomRow(t, scene)).nudge?.canSend).toBe(true);
    });

    it("025/US1-1 sem tentativa, o aluno não tem resumo de aviso", async () => {
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const { schoolClass, students } = await createClassWithStudents(t, teacher.id, { students: 1 });
      const { activity } = await createActivity(t, schoolClass, { type: "EXAM", publishAt: new Date(clock.now().getTime() - 5 * MINUTE) });
      const { token } = await openMobileSession(t, teacher);
      const room = await mobileApi(t, token).get(`/api/classes/${schoolClass.id}/activities/${activity.id}/exam-monitor`);
      expect(room.status).toBe(200);
      expect(room.body.students.find((row: { studentUserId: string }) => row.studentUserId === students[0]!.id).nudge).toBeNull();
    });
  });

  describe("o envio", () => {
    it("025/US1-3 cria um aviso pendente só para aquele aluno e registra exam_nudge.sent", async () => {
      const scene = await nudgeScene(t, clock, { occurrences: 2 });
      const res = await sendNudge(t, scene);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(res.body).toEqual({ nudge: { id: expect.any(String), sentAt: clock.now().toISOString(), dismissedAt: null, status: "PENDING" } });

      const rows = await nudges(scene);
      expect(rows).toEqual([expect.objectContaining({ id: res.body.nudge.id, activityId: scene.activityId, sentByUserId: scene.teacher.id, dismissedAt: null })]);
      const sent = await events("exam_nudge.sent");
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        actorType: "USER",
        actorUserId: scene.teacher.id,
        targetType: "ACTIVITY_ATTEMPT",
        targetId: scene.attemptId,
        metadata: { activityId: scene.activityId, nudgeId: res.body.nudge.id, occurrenceCount: 2 },
      });
      expect(await roomRow(t, scene)).toMatchObject({ nudge: { canSend: false, pendingSince: clock.now().toISOString(), sentCount: 1, lastDismissedAt: null } });
    });

    it("025/US1-4 um segundo envio devolve o mesmo aviso com 200, sem outra linha nem outro evento", async () => {
      const scene = await nudgeScene(t, clock);
      const first = await sendNudge(t, scene);
      clock.advance(10_000);
      const second = await sendNudge(t, scene);
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first.body);
      expect(await nudges(scene)).toHaveLength(1);
      expect(await events("exam_nudge.sent")).toHaveLength(1);
    });

    it("025/US1-5 depois que o aluno fecha, o sino volta e um novo envio cria outro aviso", async () => {
      const scene = await nudgeScene(t, clock);
      const first = await sendNudge(t, scene);
      clock.advance(30_000);
      await dismissByHand(t, first.body.nudge.id, clock.now());
      expect((await roomRow(t, scene)).nudge).toEqual({ canSend: true, pendingSince: null, sentCount: 1, lastDismissedAt: clock.now().toISOString() });
      clock.advance(30_000);
      const again = await sendNudge(t, scene);
      expect(again.status).toBe(201);
      expect(again.body.nudge.id).not.toBe(first.body.nudge.id);
      expect(await nudges(scene)).toHaveLength(2);
      expect((await roomRow(t, scene)).nudge?.sentCount).toBe(2);
    });

    it("025/US1-5 o resumo na sala vem dos avisos gravados (pendente e últimos fechados)", async () => {
      const scene = await nudgeScene(t, clock);
      const at = clock.now();
      await createNudge(t, scene, { sentAt: new Date(at.getTime() - 60_000), dismissedAt: new Date(at.getTime() - 50_000) });
      await createNudge(t, scene, { sentAt: new Date(at.getTime() - 40_000) });
      expect((await roomRow(t, scene)).nudge).toEqual({
        canSend: false,
        pendingSince: new Date(at.getTime() - 40_000).toISOString(),
        sentCount: 2,
        lastDismissedAt: new Date(at.getTime() - 50_000).toISOString(),
      });
    });

    it("prova silenciada (024/US4) continua com o sino aceso e o envio funciona", async () => {
      const scene = await nudgeScene(t, clock);
      const muted = await mobileApi(t, scene.token).put(`/api/classes/${scene.classId}/activities/${scene.activityId}/exam-alerts`, { muted: true });
      expect(muted.body).toEqual({ muted: true });
      expect((await roomRow(t, scene)).nudge?.canSend).toBe(true);
      expect((await sendNudge(t, scene)).status).toBe(201);
    });
  });

  describe("025/US1-6 recusas: a tentativa não está correndo ou tem poucas ocorrências", () => {
    it("025/US1-6 menos de 2 ocorrências → TOO_FEW_OCCURRENCES", async () => {
      const scene = await nudgeScene(t, clock, { occurrences: 1 });
      await expectRefused(scene, "TOO_FEW_OCCURRENCES");
    });

    it("025/US1-6 retida (4ª ocorrência) → ON_HOLD", async () => {
      const scene = await nudgeScene(t, clock, { occurrences: 4 });
      expect((await roomRow(t, scene)).nudge?.canSend).toBe(false);
      await expectRefused(scene, "ON_HOLD");
    });

    it("025/US1-6 pausada pelo professor → PAUSED", async () => {
      const scene = await nudgeScene(t, clock);
      expect((await pauseStudent(await teacherWeb(scene), scene.classId, scene.activityId, scene.student.id)).status).toBe(201);
      expect((await roomRow(t, scene)).nudge?.canSend).toBe(false);
      await expectRefused(scene, "PAUSED");
    });

    it("025/US1-6 entregue → NOT_IN_PROGRESS", async () => {
      const scene = await nudgeScene(t, clock);
      await t.prisma.activitySubmission.create({
        data: {
          attemptId: scene.attemptId,
          activityId: scene.activityId,
          studentUserId: scene.student.id,
          submittedAt: clock.now(),
          late: false,
          blankCount: 1,
          grade: "0.00",
          gradePartial: false,
          endReason: "STUDENT_SUBMITTED",
          submittedByUserId: scene.student.id,
        },
      });
      await t.prisma.activityAttempt.update({ where: { id: scene.attemptId }, data: { status: "SUBMITTED" } });
      await expectRefused(scene, "NOT_IN_PROGRESS");
    });

    it("025/US1-6 tempo esgotado: o envio liquida a tentativa e recusa → NOT_IN_PROGRESS", async () => {
      const scene = await nudgeScene(t, clock);
      clock.advance(61 * MINUTE);
      await expectRefused(scene, "NOT_IN_PROGRESS");
      expect(await t.prisma.activitySubmission.findUnique({ where: { attemptId: scene.attemptId } })).toMatchObject({ endReason: "TIME_EXPIRED" });
    });

    it("025/US1-6 atividade cancelada → NOT_IN_PROGRESS", async () => {
      const scene = await nudgeScene(t, clock);
      const cancelled = await (await teacherWeb(scene)).post(`/api/classes/${scene.classId}/activities/${scene.activityId}/cancel`, {});
      expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
      await expectRefused(scene, "NOT_IN_PROGRESS");
    });
  });

  describe("025/US1-7 fora do contexto do professor: 404 sem evento", () => {
    it("025/US1-7 turma de outro professor, trabalho, exercício e tentativa de outra atividade", async () => {
      const scene = await nudgeScene(t, clock);
      const other = await nudgeScene(t, clock);
      const own = await createClassWithStudents(t, scene.teacher.id, { students: 1 });
      const work = await createActivity(t, own.schoolClass, { executionMode: "CONTROLLED" });
      const { attemptId: workAttempt } = await createAttemptRow(t, work.activity.id, own.students[0]!.id);
      const exercise = await createActivity(t, own.schoolClass, { type: "EXERCISE" });
      const { attemptId: exerciseAttempt } = await createAttemptRow(t, exercise.activity.id, own.students[0]!.id);
      const second = await nudgeScene(t, clock, { teacher: scene.teacher });

      const app = mobileApi(t, scene.token);
      for (const path of [
        nudgesPath(other.classId, other.activityId, other.attemptId),
        nudgesPath(own.schoolClass.id, work.activity.id, workAttempt),
        nudgesPath(own.schoolClass.id, exercise.activity.id, exerciseAttempt),
        nudgesPath(scene.classId, scene.activityId, second.attemptId),
        nudgesPath(scene.classId, scene.activityId, crypto.randomUUID()),
      ]) {
        const res = await app.post(path, {});
        expect([path, res.status, res.body.code]).toEqual([path, 404, "NOT_FOUND"]);
      }
      expect(await t.prisma.examNudge.count()).toBe(0);
      expect(await t.prisma.auditEvent.count({ where: { type: { startsWith: "exam_nudge." } } })).toBe(0);
    });
  });

  describe("acesso", () => {
    it("025/US1-8 o mesmo professor pela web recebe 403 MOBILE_SESSION_REQUIRED", async () => {
      const scene = await nudgeScene(t, clock);
      const res = await (await teacherWeb(scene)).post(nudgesPath(scene.classId, scene.activityId, scene.attemptId), {});
      expect([res.status, res.body.code]).toEqual([403, "MOBILE_SESSION_REQUIRED"]);
      expect(await nudges(scene)).toEqual([]);
    });

    it("025/FR-006 o corpo é exatamente {}: texto, aluno ou mensagem → 400, nada criado", async () => {
      const scene = await nudgeScene(t, clock);
      for (const body of [{ text: "Olha a prova" }, { studentId: scene.student.id }, { message: "x" }]) {
        const res = await sendNudge(t, scene, body);
        expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
      }
      expect(await nudges(scene)).toEqual([]);
    });

    it("sem provas.avisos.enviar ou sem chamada.registrar → 403", async () => {
      const scene = await nudgeScene(t, clock);
      for (const key of ["provas.avisos.enviar", "chamada.registrar"]) {
        const grant = await t.prisma.rolePermission.findFirstOrThrow({ where: { role: { key: "TEACHER" }, permission: { key } } });
        await t.prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } } });
        try {
          const res = await sendNudge(t, scene);
          expect([key, res.status, res.body.code]).toEqual([key, 403, "FORBIDDEN"]);
        } finally {
          await t.prisma.rolePermission.create({ data: { roleId: grant.roleId, permissionId: grant.permissionId } });
        }
      }
      expect(await nudges(scene)).toEqual([]);
    });
  });

  it("025/US1-9 025/FR-013 o envio não muda ocorrências, retenções, pausas, entregas, alertas nem o fim da tentativa", async () => {
    const scene = await nudgeScene(t, clock, { occurrences: 3 });
    const snapshot = async () => ({
      occurrences: await t.prisma.examOccurrence.findMany({ where: { attemptId: scene.attemptId }, orderBy: { ordinal: "asc" } }),
      holds: await t.prisma.examAttemptHold.findMany({ where: { attemptId: scene.attemptId } }),
      pauses: await t.prisma.attemptPause.findMany({ where: { attemptId: scene.attemptId } }),
      submissions: await t.prisma.activitySubmission.findMany({ where: { attemptId: scene.attemptId } }),
      alerts: await t.prisma.examAlert.findMany({ where: { attemptId: scene.attemptId }, orderBy: { occurrenceOrdinal: "asc" } }),
      attempt: await t.prisma.activityAttempt.findUniqueOrThrow({ where: { id: scene.attemptId } }),
      endsAt: (await roomRow(t, scene)).endsAt,
    });
    const before = await snapshot();
    expect((await sendNudge(t, scene)).status).toBe(201);
    expect(await snapshot()).toEqual(before);
  });
});
