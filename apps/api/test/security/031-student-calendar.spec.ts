import { StudentCalendarSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../helpers/clock";
import {
  createClass,
  createConfirmedRevision,
  createEnrollment,
  createPlan,
  createSubject,
  createSyllabusDocument,
  createTopic,
  createUser,
  loginAs,
} from "../helpers/factories";
import { captureLogs } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

// 031 US4 (spec.md), FR-021/FR-022, SC-004/SC-005: only what the student may see, only of their ACTIVE enrollments.
const PERIOD = { startsOn: "2026-08-03", endsOn: "2026-12-11" };
const TOPIC = "MARCADOR-TOPICO-031";
const REASON = "MARCADOR-MOTIVO-031";
const DESCRIPTION = "MARCADOR-DESCRICAO-031";
const NOTICE = "MARCADOR-AVISO-031";

describe("031/US4 — só o que o aluno pode ver", () => {
  const logs = captureLogs();
  const clock = new FixedClock("2026-11-16T15:00:00.000Z");
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ clock, logs });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
  });

  /** A disciplina with numbered meetings, topics, an exam, a holiday and a Falta with its reason; one enrolled student. */
  async function scene() {
    const teacher = await createUser(t, {
      roles: ["TEACHER"],
      name: "Ricardo Mendes",
    });
    const subject = await createSubject(t, teacher.id, {
      name: "Programação Orientada a Objetos",
    });
    const schoolClass = await createClass(t, teacher.id, {
      subjectId: subject.id,
      ...PERIOD,
    });
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const base = `/api/classes/${schoolClass.id}/meetings`;
    await teacherClient.put(base, {
      planRevision: null,
      add: ["2026-11-09", "2026-11-16"],
      remove: [],
      resolutions: [],
    });

    const document = await createSyllabusDocument(t, subject.id, {
      status: "PROCESSED",
    });
    const confirmed = await createConfirmedRevision(t, document.id, [
      { title: "Fundamentos", items: ["Classes"] },
    ]);
    const plan = await createPlan(t, schoolClass.id, confirmed.revision.id, {
      status: "ACTIVE",
    });
    const meetings = await t.prisma.classMeeting.findMany({
      where: { classId: schoolClass.id },
      orderBy: { meetingDate: "asc" },
    });
    const topic = await createTopic(t, plan.id, {
      title: TOPIC,
      description: TOPIC,
      meetingId: meetings[1]!.id,
    });

    const saved = await teacherClient.put(base, {
      planRevision: plan.revision,
      add: [],
      set: [
        { date: "2026-11-23", kind: "EXAM", description: DESCRIPTION },
        {
          date: "2026-11-20",
          kind: "HOLIDAY",
          description: "Consciência Negra",
        },
        {
          date: "2026-11-18",
          kind: "TEACHER_ABSENCE",
          absenceReason: REASON,
          absenceNotice: NOTICE,
        },
      ],
      remove: [],
      resolutions: [],
    });
    expect(saved.status).toBe(200);

    const student = await createUser(t);
    await createEnrollment(t, schoolClass.id, student.id);
    const studentClient = api(t, { cookie: await loginAs(t, student) });
    return { teacher, schoolClass, meetings, topic, student, studentClient };
  }

  const path = (classId: string) => `/api/me/classes/${classId}/calendar`;

  it("031/US4-1 031/FR-022 as chaves da resposta são exatamente as do contrato, em todos os níveis", async () => {
    const { schoolClass, studentClient } = await scene();
    logs.clear();
    const res = await studentClient.get(path(schoolClass.id));
    expect(res.status).toBe(200);
    expect(StudentCalendarSchema.safeParse(res.body).success).toBe(true);
    expect(Object.keys(res.body).sort()).toEqual(["class", "days", "today"]);
    expect(Object.keys(res.body.class).sort()).toEqual([
      "endsOn",
      "id",
      "startsOn",
      "subjectName",
      "teacherName",
    ]);
    for (const day of res.body.days as object[])
      expect(Object.keys(day).sort()).toEqual(["date", "kind", "text"]);
    expect(res.body.days).toHaveLength(5);
  });

  it("031/US4-2 031/SC-004 o JSON não traz tópico, número, situação, motivo nem ids de tópico ou encontro; o log também não", async () => {
    const { schoolClass, meetings, topic, studentClient } = await scene();
    logs.clear();
    const res = await studentClient.get(path(schoolClass.id));
    const raw = JSON.stringify(res.body);

    for (const forbidden of [
      TOPIC,
      REASON,
      topic.id,
      ...meetings.map((meeting) => meeting.id),
    ]) {
      expect(raw).not.toContain(forbidden);
    }
    for (const key of [
      '"number"',
      '"status"',
      '"topicCount"',
      '"absenceReason"',
      '"description"',
      '"updatedAt"',
      '"createdAt"',
    ]) {
      expect(raw).not.toContain(key);
    }
    // The notice and the description reach the student, as the contract says…
    expect(raw).toContain(NOTICE);
    expect(raw).toContain(DESCRIPTION);
    // …but no text of the calendar is ever logged.
    for (const text of [TOPIC, REASON, DESCRIPTION, NOTICE])
      expect(logs.text()).not.toContain(text);
  });

  it("031/US4-3 031/SC-005 outra turma, matrícula encerrada e id inexistente → o mesmo 404; id mal formado → 400", async () => {
    const { schoolClass, student, studentClient } = await scene();
    const otherTeacher = await createUser(t, { roles: ["TEACHER"] });
    const otherClass = await createClass(t, otherTeacher.id, PERIOD);
    await t.prisma.classMeeting.create({
      data: {
        classId: otherClass.id,
        meetingDate: new Date("2026-11-16T00:00:00.000Z"),
      },
    });

    const outside = await studentClient.get(path(otherClass.id));
    const unknown = await studentClient.get(
      path("00000000-0000-4000-8000-000000000999"),
    );
    expect(outside.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(outside.body);

    await t.prisma.enrollment.updateMany({
      where: { studentUserId: student.id },
      data: { status: "REMOVED", removedAt: new Date() },
    });
    const ended = await studentClient.get(path(schoolClass.id));
    expect(ended.status).toBe(404);
    expect(ended.body).toEqual(outside.body);

    for (const malformed of [
      "nao-e-um-id",
      "123",
      "00000000-0000-4000-8000-00000000099",
    ]) {
      const res = await studentClient.get(path(malformed));
      expect(res.status, malformed).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    }
  });

  it("031/US4-4 professor (mesmo o da disciplina), gestor e admin → 403", async () => {
    const { schoolClass, teacher } = await scene();
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const admin = await createUser(t, { roles: ["ADMIN"] });
    for (const user of [teacher, manager, admin]) {
      const res = await api(t, { cookie: await loginAs(t, user) }).get(
        path(schoolClass.id),
      );
      expect(res.status).toBe(403);
    }
  });

  it("031/US4-5 turma encerrada (027) com a matrícula ativa → o aluno ainda lê o calendário", async () => {
    const { schoolClass, studentClient } = await scene();
    await t.prisma.cohort.update({
      where: { id: schoolClass.cohortId },
      data: { status: "INACTIVE", statusChangedAt: new Date() },
    });
    await t.prisma.schoolClass.update({
      where: { id: schoolClass.id },
      data: { status: "INACTIVE", statusChangedAt: new Date() },
    });
    const res = await studentClient.get(path(schoolClass.id));
    expect(res.status).toBe(200);
    expect(res.body.days).toHaveLength(5);
  });

  it("031/FR-013 outra disciplina da mesma turma (de outro professor) → o calendário dela, não o da primeira", async () => {
    const { schoolClass, studentClient } = await scene();
    const otherTeacher = await createUser(t, {
      roles: ["TEACHER"],
      name: "Ana Souza",
    });
    const otherSubject = await createSubject(t, otherTeacher.id, {
      name: "Banco de Dados",
    });
    const sibling = await createClass(t, otherTeacher.id, {
      cohortId: schoolClass.cohortId,
      subjectId: otherSubject.id,
      ...PERIOD,
    });
    await t.prisma.classCalendarDay.create({
      data: {
        classId: sibling.id,
        dayDate: new Date("2026-11-27T00:00:00.000Z"),
        kind: "SPECIAL_EVENT",
        description: "Palestra",
      },
    });

    const res = await studentClient.get(path(sibling.id));
    expect(res.status).toBe(200);
    expect(res.body.class).toMatchObject({
      id: sibling.id,
      subjectName: "Banco de Dados",
      teacherName: "Ana Souza",
    });
    expect(res.body.days).toEqual([
      { date: "2026-11-27", kind: "SPECIAL_EVENT", text: "Palestra" },
    ]);
    expect(JSON.stringify(res.body)).not.toContain(DESCRIPTION);
  });
});
