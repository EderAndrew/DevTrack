import type { IntegrityEventInput, RecordIntegrityEventsResult, TeacherActivity, TeacherExam } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ExamAlertSink } from "../../src/modules/attempt-integrity/exam-alert-sink";
import { ExamAlertWorker } from "../../src/modules/exam-alerts/exam-alert.worker";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { applyExam, approvedExam, decideHold, getExamMonitor, startExam } from "../helpers/exams";
import { pushedTo, runAlertWorker, teacherPhone } from "../helpers/exam-alerts";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { mobileApi } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { FakePushClient } from "../fixtures/push/fake-push-client";
import { createConfirmedSyllabus } from "../helpers/works";

const SECOND = 1000;
type Client = ReturnType<typeof api>;

/**
 * 024/US3 (research Y5–Y7, contracts/push-notifications.md): each counted occurrence and each hold writes one
 * alert in the student's batch transaction; the worker sends it to the class teacher's phones — once each,
 * on the channel of its kind, with the minimum text — and to nobody else; a failure never touches the exam.
 */
describe("024/US3 o celular avisa a cada ocorrência e a cada prova retida", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let classId: string;
  let students: TestUser[];
  let exam: TeacherExam;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    t.push.reset();
    clock.set(new Date());
    t.config.push.enabled = true;
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ana" });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    classId = created.schoolClass.id;
    students = created.students;
    exam = await approvedExam(t, teacherClient, syllabus);
  });

  const applied = async () => {
    const res = await applyExam(teacherClient, classId, exam.id, { acknowledgeOutOfScope: true, title: "Prova de Java" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  const started = async (student = students[0]!) => {
    const activity = await applied();
    const client = api(t, { cookie: await loginAs(t, student) });
    expect((await startExam(client, activity.id)).status).toBe(200);
    return { activity, client };
  };
  const send = async (client: Client, activityId: string, events: IntegrityEventInput[]) => {
    const res = await recordEvents(client, activityId, events);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as RecordIntegrityEventsResult;
  };
  /** One countable event, then the clock moves past the 2 s grouping window. */
  const occur = async (client: Client, activityId: string) => {
    const body = await send(client, activityId, [integrityEvent("SCREEN_LEFT")]);
    clock.advance(5 * SECOND);
    return body;
  };
  const alerts = () => t.prisma.examAlert.findMany({ orderBy: [{ createdAt: "asc" }, { occurrenceOrdinal: "asc" }] });

  it("024/US3-1 uma ocorrência contada vira um aviso no canal das ocorrências, com o aviso de 1 a 3", async () => {
    const phone = await teacherPhone(t, teacher);
    const { activity, client } = await started();
    await occur(client, activity.id);
    expect((await alerts()).map((alert) => [alert.kind, alert.occurrenceOrdinal, alert.status])).toEqual([["OCCURRENCE", 1, "PENDING"]]);

    await runAlertWorker(t);
    const [message] = pushedTo(t, phone.pushToken);
    expect(message).toEqual({
      to: phone.pushToken,
      channelId: "exam-occurrences",
      title: "Ocorrência na prova",
      body: `${students[0]!.name} — Aviso 1 de 3 — Prova de Java (${(await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } })).name})`,
      data: { kind: "OCCURRENCE", classId, activityId: activity.id, studentUserId: students[0]!.id },
      priority: "high",
      sound: "default",
    });
    expect((await alerts())[0]!.status).toBe("SENT");
    expect(await t.prisma.examAlertDelivery.findMany()).toEqual([expect.objectContaining({ deviceId: phone.deviceId, status: "TICKET_OK" })]);
  });

  it("024/US3-2 024/SC-002 a 4ª ocorrência retém a prova e vira só o aviso de prova retida, distinto", async () => {
    const phone = await teacherPhone(t, teacher);
    const { activity, client } = await started();
    for (let i = 0; i < 4; i += 1) await occur(client, activity.id);
    const rows = await alerts();
    const hold = await t.prisma.examAttemptHold.findFirstOrThrow({ where: { activityId: activity.id } });
    expect(rows.map((alert) => [alert.kind, alert.occurrenceOrdinal, alert.holdId])).toEqual([
      ["OCCURRENCE", 1, null],
      ["OCCURRENCE", 2, null],
      ["OCCURRENCE", 3, null],
      ["HOLD", 4, hold.id],
    ]);
    await runAlertWorker(t);
    const sent = pushedTo(t, phone.pushToken);
    expect(sent.map((message) => [message.channelId, message.title])).toEqual([
      ["exam-occurrences", "Ocorrência na prova"],
      ["exam-occurrences", "Ocorrência na prova"],
      ["exam-occurrences", "Ocorrência na prova"],
      ["exam-holds", "Prova retida — decisão pendente"],
    ]);
    expect(sent[3]!.data.kind).toBe("HOLD");
  });

  it("024/US3-3 sinais agrupados pelo servidor geram um único aviso", async () => {
    await teacherPhone(t, teacher);
    const { activity, client } = await started();
    await send(client, activity.id, [integrityEvent("FULLSCREEN_EXITED"), integrityEvent("SCREEN_LEFT")]);
    expect(await alerts()).toHaveLength(1);
  });

  it("024/US3-4 uma ocorrência com a prova retida não conta e não gera aviso; um lote reenviado também não", async () => {
    await teacherPhone(t, teacher);
    const { activity, client } = await started();
    const events = [integrityEvent("SCREEN_LEFT")];
    await send(client, activity.id, events);
    await send(client, activity.id, events);
    expect(await alerts()).toHaveLength(1);
    clock.advance(5 * SECOND);
    for (let i = 0; i < 3; i += 1) await occur(client, activity.id);
    expect(await alerts()).toHaveLength(4);
    const held = await send(client, activity.id, [integrityEvent("SCREEN_LEFT")]);
    expect(held.exam).toEqual({ occurrenceCount: 4, held: true });
    expect(await alerts()).toHaveLength(4);
  });

  it("depois de devolver a prova, uma nova ocorrência gera Nova ocorrência e uma nova retenção gera outro aviso de retida", async () => {
    const phone = await teacherPhone(t, teacher);
    const { activity, client } = await started();
    for (let i = 0; i < 4; i += 1) await occur(client, activity.id);
    const hold = await t.prisma.examAttemptHold.findFirstOrThrow({ where: { activityId: activity.id } });
    const returned = await decideHold(teacherClient, classId, activity.id, hold.id, "return");
    expect(returned.status, JSON.stringify(returned.body)).toBe(200);
    await occur(client, activity.id);
    const rows = await alerts();
    expect(rows.at(-1)).toMatchObject({ kind: "HOLD", occurrenceOrdinal: 5 });
    await runAlertWorker(t);
    expect(pushedTo(t, phone.pushToken).at(-1)).toMatchObject({ channelId: "exam-holds" });
  });

  it("024/US3-6 dois celulares do professor recebem; 024/US3-7 o celular de outro professor não recebe nada", async () => {
    const first = await teacherPhone(t, teacher);
    const second = await teacherPhone(t, teacher);
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherPhone = await teacherPhone(t, other);
    const { activity, client } = await started();
    await occur(client, activity.id);
    await runAlertWorker(t);
    expect(pushedTo(t, first.pushToken)).toHaveLength(1);
    expect(pushedTo(t, second.pushToken)).toHaveLength(1);
    expect(pushedTo(t, otherPhone.pushToken)).toHaveLength(0);
    expect(await t.prisma.examAlertDelivery.count()).toBe(2);
  });

  it("024/SC-004 depois do Sair ou de uma revogação o celular não recebe mais nada", async () => {
    const { activity, client } = await started();
    const loggedOut = await teacherPhone(t, teacher);
    expect((await mobileApi(t, loggedOut.token).delete("/api/auth/mobile/sessions/current")).status).toBe(204);
    const revoked = await teacherPhone(t, teacher);
    await t.prisma.session.update({ where: { id: revoked.sessionId }, data: { revokedAt: new Date(), revokeReason: "LOGOUT_ALL" } });
    await occur(client, activity.id);
    await runAlertWorker(t, clock.now());
    expect(t.push.sent).toEqual([]);
    expect((await alerts())[0]!.status).toBe("SKIPPED");
  });

  it("024/SC-004 cada perda de acesso, em provas separadas, deixa o aviso sem destinatário", async () => {
    for (const lose of [
      (phone: { sessionId: string }) => t.prisma.session.update({ where: { id: phone.sessionId }, data: { absoluteExpiresAt: new Date(Date.now() - 1000) } }),
      () => t.prisma.schoolClass.update({ where: { id: classId }, data: { status: "ARCHIVED" } }),
      () => t.prisma.userRole.updateMany({ where: { userId: teacher.id }, data: { status: "INACTIVE" } }),
    ]) {
      await t.prisma.schoolClass.update({ where: { id: classId }, data: { status: "ACTIVE" } });
      await t.prisma.userRole.updateMany({ where: { userId: teacher.id }, data: { status: "ACTIVE" } });
      const phone = await teacherPhone(t, teacher);
      const { activity, client } = await started(students[0]!);
      await occur(client, activity.id);
      await lose(phone);
      t.push.reset();
      await runAlertWorker(t, clock.now());
      expect(t.push.sent).toEqual([]);
      expect((await t.prisma.examAlert.findFirstOrThrow({ where: { activityId: activity.id } })).status).toBe("SKIPPED");
      await t.prisma.mobileDevice.deleteMany();
      await t.prisma.userRole.updateMany({ where: { userId: teacher.id }, data: { status: "ACTIVE" } });
      await t.prisma.schoolClass.update({ where: { id: classId }, data: { status: "ACTIVE" } });
      await t.prisma.classActivity.update({ where: { id: activity.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    }
  });

  it("024/US3-8 024/FR-016 o aviso não tem enunciado, resposta, nota, e-mail nem RA, nem fraude, cola ou violação", async () => {
    await teacherPhone(t, teacher);
    await t.prisma.studentProfile.update({ where: { userId: students[0]!.id }, data: { ra: "RAMARCADOR024" } });
    const { activity, client } = await started();
    for (let i = 0; i < 4; i += 1) await occur(client, activity.id);
    await runAlertWorker(t);
    const text = JSON.stringify(t.push.sent);
    expect(t.push.sent.length).toBe(4);
    for (const forbidden of [students[0]!.email, "RAMARCADOR024", "nota", "resposta", "enunciado"]) expect(text).not.toContain(forbidden);
    expect(text).not.toMatch(/fraude|cola|viola/i);
  });

  it("024/US3-9 024/SC-006 024/FR-015 o envio falhando ou desligado não muda nada na prova", async () => {
    const run = async (mode: "ok" | "failing" | "off") => {
      await resetDb(t.prisma);
      t.push.reset();
      clock.set(new Date());
      t.config.push.enabled = mode !== "off";
      teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ana" });
      teacherClient = api(t, { cookie: await loginAs(t, teacher) });
      const syllabus = await createConfirmedSyllabus(t, teacher.id);
      const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 1 });
      classId = created.schoolClass.id;
      students = created.students;
      exam = await approvedExam(t, teacherClient, syllabus);
      await teacherPhone(t, teacher);
      if (mode === "failing") t.push.failing = "transient";
      const { activity, client } = await started();
      const responses = [];
      for (let i = 0; i < 4; i += 1) {
        responses.push((await occur(client, activity.id)).exam);
        await runAlertWorker(t, clock.now());
      }
      const monitor = (await getExamMonitor(teacherClient, classId, activity.id)).body;
      const occurrences = await t.prisma.examOccurrence.findMany({ orderBy: { ordinal: "asc" }, select: { ordinal: true, kind: true } });
      const holds = await t.prisma.examAttemptHold.findMany({ select: { occurrenceOrdinal: true, resolution: true } });
      return {
        responses,
        occurrences,
        holds,
        students: monitor.students.map((row: { examStatus: string; occurrenceCount: number }) => [row.examStatus, row.occurrenceCount]),
        alertStatuses: (await alerts()).map((alert) => alert.status),
      };
    };
    const ok = await run("ok");
    const failing = await run("failing");
    const off = await run("off");
    const facts = ({ alertStatuses, ...rest }: typeof ok) => rest;
    expect(facts(failing)).toEqual(facts(ok));
    expect(facts(off)).toEqual(facts(ok));
    expect(ok.alertStatuses).toEqual(["SENT", "SENT", "SENT", "SENT"]);
    expect(failing.alertStatuses.every((status) => status === "PENDING" || status === "EXPIRED")).toBe(true);
    expect(off.alertStatuses).toEqual(["SKIPPED", "SKIPPED", "SKIPPED", "SKIPPED"]);
    t.config.push.enabled = true;
  });
});

/**
 * 024/SC-001 (plan "Performance Goals"): with the worker on its timer and woken by `kick()`, an alert reaches
 * the push client within 2 s of the commit in 95% of 40 occurrences (SC-001 allows 10 s end to end).
 */
describe("024/SC-001 o aviso sai em até 2 s depois da ocorrência", () => {
  let t: TestApp;
  const push = new FakePushClient();

  beforeAll(async () => {
    t = await createTestApp({ push, config: { push: { enabled: true, accessToken: "teste-024-TOKEN-EXPO-FALSO", baseUrl: "https://exp.host", alertIntervalMs: 1000, alertMaxAgeSeconds: 60 } } });
  });
  afterAll(() => t.close());

  it("024/SC-001 do commit ao envio em até 2 s em 95% de 40 ocorrências", async () => {
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const { schoolClass, students } = await createClassWithStudents(t, teacher.id, { students: 10 });
    await teacherPhone(t, teacher);
    const { activity } = await createActivity(t, schoolClass, { type: "EXAM", publishAt: new Date(Date.now() - 60_000), durationMinutes: 60, startWindowMinutes: 15 });
    const attempts: { attemptId: string; studentUserId: string }[] = [];
    for (const student of students) {
      await t.prisma.activityAttendance.create({ data: { activityId: activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: new Date(), markedById: teacher.id } });
      attempts.push({ attemptId: (await createAttemptRow(t, activity.id, student.id)).attemptId, studentUserId: student.id });
    }
    const sink = t.get(ExamAlertSink);
    const latencies: number[] = [];
    for (let ordinal = 1; ordinal <= 4; ordinal += 1) {
      for (const attempt of attempts) {
        const before = push.sent.length;
        const committed = Date.now();
        await t.prisma.runInTransaction((tx) =>
          sink.record(tx, [{ kind: "OCCURRENCE", activityId: activity.id, attemptId: attempt.attemptId, studentUserId: attempt.studentUserId, occurrenceOrdinal: ordinal, holdId: null, recordedAt: new Date() }]),
        );
        sink.kick();
        while (push.sent.length === before && Date.now() - committed < 5000) await new Promise((resolve) => setTimeout(resolve, 10));
        latencies.push(Date.now() - committed);
      }
    }
    latencies.sort((a, b) => a - b);
    expect(latencies).toHaveLength(40);
    expect(latencies[Math.ceil(0.95 * latencies.length) - 1]!).toBeLessThanOrEqual(2000);
    expect(t.get(ExamAlertWorker)).toBeDefined();
  });
});
