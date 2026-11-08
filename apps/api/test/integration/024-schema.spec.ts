import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { holdByHand } from "../helpers/exams";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const DAY = 86_400_000;
const pushToken = () => `ExponentPushToken[${randomBytes(12).toString("hex")}]`;

/**
 * 024 data-model.md (research Y3, Y5, Y8, Y9): the database keeps, by itself, the kind of each session,
 * that a device belongs to a mobile session of its own user, that a mute is about an exam, that an
 * occurrence has at most one alert and an alert one delivery per device, and that a settled alert only
 * leaves through the retention job (constitution V) — rows written by Prisma, without the API in the way.
 */
describe("024/FR-003 024/FR-014 024/FR-018 024/FR-020 regras do monitoramento no celular garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacher: TestUser;
  let student: TestUser;
  let schoolClass: { id: string; teacherId: string };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
  });

  const session = (userId: string, client?: "WEB" | "MOBILE") =>
    t.prisma.session.create({
      data: {
        userId,
        tokenHash: randomBytes(32).toString("hex"),
        lastUsedAt: new Date(),
        absoluteExpiresAt: new Date(Date.now() + 90 * DAY),
        ...(client ? { client } : {}),
      },
    });

  const device = (sessionId: string, userId: string, token = pushToken()) =>
    t.prisma.mobileDevice.create({ data: { sessionId, userId, platform: "ANDROID", pushToken: token } });

  /** An EXAM activity with the student marked present (016) and their attempt in progress. */
  const examAttempt = async () => {
    const { activity } = await createActivity(t, schoolClass, { type: "EXAM" });
    await t.prisma.activityAttendance.create({
      data: { activityId: activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: new Date(), markedById: teacher.id },
    });
    const { attemptId } = await createAttemptRow(t, activity.id, student.id);
    return { activityId: activity.id, attemptId };
  };

  const alert = (ids: { activityId: string; attemptId: string }, data: Record<string, unknown> = {}) =>
    t.prisma.examAlert.create({
      data: {
        kind: "OCCURRENCE",
        activityId: ids.activityId,
        attemptId: ids.attemptId,
        studentUserId: student.id,
        occurrenceOrdinal: 1,
        createdAt: new Date(),
        ...data,
      },
    });

  /** The only way a row of `exam_alerts` leaves: the retention job's setting, inside its transaction. */
  const purge = (id: string) =>
    t.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('devtrack.exam_alert_purge', 'on', true)`;
      await tx.examAlert.delete({ where: { id } });
    });

  describe("sessions.client (research Y3)", () => {
    it("024/FR-004 toda sessão existente ou nova sem tipo é WEB; o tipo não muda depois de criado", async () => {
      const web = await session(teacher.id);
      expect(web.client).toBe("WEB");
      const mobile = await session(teacher.id, "MOBILE");
      expect(mobile.client).toBe("MOBILE");
      await expect(t.prisma.session.update({ where: { id: mobile.id }, data: { client: "WEB" } })).rejects.toThrow(/client/);
      await expect(t.prisma.session.update({ where: { id: web.id }, data: { client: "MOBILE" } })).rejects.toThrow(/client/);
      // The rest of the session keeps changing as before (last use, revocation).
      await t.prisma.session.update({ where: { id: mobile.id }, data: { lastUsedAt: new Date(), revokedAt: new Date(), revokeReason: "LOGOUT" } });
    });
  });

  describe("mobile_devices (research Y9)", () => {
    it("024/FR-018 só uma sessão MOBILE do próprio usuário recebe um celular, um por sessão", async () => {
      const web = await session(teacher.id, "WEB");
      await expect(device(web.id, teacher.id)).rejects.toThrow(/MOBILE session/);

      const mobile = await session(teacher.id, "MOBILE");
      await expect(device(mobile.id, student.id)).rejects.toThrow(/user of its session/);
      const first = await device(mobile.id, teacher.id);
      await expect(device(mobile.id, teacher.id)).rejects.toThrow(/session_id/);

      // Moving the device to another user's session is refused too.
      const other = await session(student.id, "MOBILE");
      await expect(t.prisma.mobileDevice.update({ where: { id: first.id }, data: { sessionId: other.id } })).rejects.toThrow(/user of its session/);
    });

    it("024/FR-018 o token de envio é único e só no formato Expo, com tamanho limitado", async () => {
      const a = await session(teacher.id, "MOBILE");
      const b = await session(teacher.id, "MOBILE");
      const token = pushToken();
      await device(a.id, teacher.id, token);
      await expect(device(b.id, teacher.id, token)).rejects.toThrow(/push_token/);

      for (const bad of ["abc", "ExponentPushToken[curto]", `ExponentPushToken[${"a".repeat(201)}]`, "ExponentPushToken[abc def ghij]"]) {
        await expect(device(b.id, teacher.id, bad)).rejects.toThrow(/mobile_devices_push_token_chk/);
      }
      await device(b.id, teacher.id, "ExpoPushToken[abcdefghij_-]");
    });

    it("024/FR-003 apagar a sessão leva o celular junto", async () => {
      const mobile = await session(teacher.id, "MOBILE");
      await device(mobile.id, teacher.id);
      await t.prisma.session.delete({ where: { id: mobile.id } });
      expect(await t.prisma.mobileDevice.count()).toBe(0);
    });
  });

  describe("exam_alert_mutes (research Y8)", () => {
    it("024/FR-020 um silenciamento por professor e prova, e só de uma prova", async () => {
      const { activityId } = await examAttempt();
      await t.prisma.examAlertMute.create({ data: { teacherUserId: teacher.id, activityId } });
      await expect(t.prisma.examAlertMute.create({ data: { teacherUserId: teacher.id, activityId } })).rejects.toThrow(/Unique constraint|teacher_user_id/);

      const work = await createActivity(t, schoolClass, {});
      await expect(t.prisma.examAlertMute.create({ data: { teacherUserId: teacher.id, activityId: work.activity.id } })).rejects.toThrow(
        /only an EXAM activity/,
      );
    });
  });

  describe("exam_alerts (research Y5)", () => {
    it("024/FR-014 no máximo um alerta por ocorrência da tentativa (um lote reenviado não grava outro)", async () => {
      const ids = await examAttempt();
      await alert(ids);
      await expect(alert(ids)).rejects.toThrow(/Unique constraint|attempt_id/);
      await alert(ids, { occurrenceOrdinal: 2 });
    });

    it("024/FR-013 HOLD tem a retenção; OCCURRENCE não; ordinal ≥ 1 e no máximo 3 tentativas de envio", async () => {
      const ids = await examAttempt();
      const hold = await holdByHand(t, { id: ids.attemptId, activityId: ids.activityId, studentUserId: student.id });
      await expect(alert(ids, { kind: "HOLD", occurrenceOrdinal: 4 })).rejects.toThrow(/exam_alerts_hold_chk/);
      await expect(alert(ids, { occurrenceOrdinal: 3, holdId: hold.id })).rejects.toThrow(/exam_alerts_hold_chk/);
      await alert(ids, { kind: "HOLD", occurrenceOrdinal: 4, holdId: hold.id });

      await expect(alert(ids, { occurrenceOrdinal: 0 })).rejects.toThrow(/exam_alerts_ordinal_chk/);
      await expect(alert(ids, { occurrenceOrdinal: 1, tries: 4 })).rejects.toThrow(/exam_alerts_tries_chk/);
      await expect(alert(ids, { occurrenceOrdinal: 1, tries: -1 })).rejects.toThrow(/exam_alerts_tries_chk/);
    });

    it("o alerta aponta para a tentativa daquele aluno naquela prova", async () => {
      const ids = await examAttempt();
      const other = await examAttempt();
      await expect(alert({ activityId: other.activityId, attemptId: ids.attemptId })).rejects.toThrow(/Foreign key|exam_alerts_attempt_fkey/);
      await expect(alert(ids, { studentUserId: teacher.id })).rejects.toThrow(/Foreign key|exam_alerts_attempt_fkey/);
    });

    it("024/FR-019 um alerta PENDING muda de estado uma vez; depois de SENT, SKIPPED ou EXPIRED fica como está", async () => {
      const ids = await examAttempt();
      const pending = await alert(ids);
      await t.prisma.examAlert.update({ where: { id: pending.id }, data: { tries: 1, claimedUntil: new Date() } });
      await t.prisma.examAlert.update({ where: { id: pending.id }, data: { status: "SENT", processedAt: new Date() } });
      await expect(t.prisma.examAlert.update({ where: { id: pending.id }, data: { status: "PENDING" } })).rejects.toThrow(/settled/);
      await expect(t.prisma.examAlert.update({ where: { id: pending.id }, data: { tries: 2 } })).rejects.toThrow(/settled/);

      for (const [ordinal, status] of [
        [2, "SKIPPED"],
        [3, "EXPIRED"],
      ] as const) {
        const row = await alert(ids, { occurrenceOrdinal: ordinal });
        await t.prisma.examAlert.update({ where: { id: row.id }, data: { status, processedAt: new Date() } });
        await expect(t.prisma.examAlert.update({ where: { id: row.id }, data: { status: "SENT" } })).rejects.toThrow(/settled/);
      }
    });

    it("só o job de retenção apaga um alerta (com as entregas)", async () => {
      const ids = await examAttempt();
      const row = await alert(ids);
      const deviceId = randomUUID();
      await t.prisma.examAlertDelivery.create({ data: { alertId: row.id, deviceId, status: "SENDING", sentAt: new Date() } });
      await expect(t.prisma.examAlert.delete({ where: { id: row.id } })).rejects.toThrow(/retention job/);
      await purge(row.id);
      expect(await t.prisma.examAlertDelivery.count()).toBe(0);
    });
  });

  describe("exam_alert_deliveries (research Y6)", () => {
    it("024/FR-012 no máximo uma entrega por alerta e celular; o erro é só um código", async () => {
      const ids = await examAttempt();
      const row = await alert(ids);
      const deviceId = randomUUID();
      const delivery = { alertId: row.id, deviceId, status: "SENDING" as const, sentAt: new Date() };
      await t.prisma.examAlertDelivery.create({ data: delivery });
      await expect(t.prisma.examAlertDelivery.create({ data: delivery })).rejects.toThrow(/Unique constraint|alert_id/);

      await t.prisma.examAlertDelivery.create({
        data: { ...delivery, deviceId: randomUUID(), status: "TICKET_ERROR", errorCode: "DeviceNotRegistered" },
      });
      for (const errorCode of ["Device not registered", "1abc", "x".repeat(65)]) {
        await expect(
          t.prisma.examAlertDelivery.create({ data: { ...delivery, deviceId: randomUUID(), status: "TICKET_ERROR", errorCode } }),
        ).rejects.toThrow(/exam_alert_deliveries_error_code_chk/);
      }
    });
  });
});
