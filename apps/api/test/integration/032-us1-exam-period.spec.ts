import type { ExamMonitor, Room, StudentActivity, TeacherActivity, TeacherActivitySummary, TeacherExam } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents } from "../helpers/activities";
import { getRoom, markPresent, unmark } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, getExamMonitor, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 032/US1 — the teacher applies an exam for a period (start now or scheduled, end date and time) and
 * releases whoever arrives at any moment of it (032/FR-001…FR-008, FR-012…FR-014): no start window,
 * the end validated against the start and the duration with the server's clock, marks refused after
 * the end, and a published exam's end only extended.
 */

// 19:10 in São Paulo (UTC-3); the period of the scenarios runs 19:10 → 22:00 (170 min).
const START = "2026-11-30T22:10:00.000Z";
const at = (ms: number) => new Date(new Date(START).getTime() + ms);
const iso = (ms: number) => at(ms).toISOString();
const END = 170 * MINUTE;
type Client = ReturnType<typeof api>;

describe("032/US1 professor aplica a prova com um período e libera quem chega", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let exam: TeacherExam;

  const base = () => `/api/classes/${classId}/activities`;
  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  /** An exam applied through the route with no attendance taken: by default now → 22:00, 60 min. */
  const applied = async (overrides: Parameters<typeof applyExam>[3] = {}) => {
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, attendance: "NONE", deadline: iso(END), ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  const teacherView = async (activityId: string) => {
    const res = await client.get(`${base()}/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as TeacherActivity;
  };
  const patch = (activity: { id: string; version: number }, body: Record<string, unknown>) =>
    client.patch(`${base()}/${activity.id}`, { version: activity.version, ...body });
  const studentSees = async (student: Client, activityId: string) => {
    const listed = (await student.get("/api/me/activities")).body.items.some((item: { id: string }) => item.id === activityId);
    return { listed, detail: (await student.get(`/api/me/activities/${activityId}`)).status };
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Ana Professora" });
    client = api(t, { cookie: await loginAs(t, teacher) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 3 });
    classId = created.schoolClass.id;
    students = created.students;
    exam = await approvedExam(t, client, syllabus);
  });

  it("032/US1-1 032/FR-001 032/FR-008 a prova aplicada para hoje 19:10–22:00 fica agendada até 19:10 e mostra o período, sem janela de início", async () => {
    clock.set(iso(-70 * MINUTE)); // 18:00
    const activity = await applied({ publishAt: START });
    expect(activity.deadline).toBe(iso(END));
    expect(activity.publishAt).toBe(START);
    expect(activity.exam).toEqual({ durationMinutes: 60, inactivityLimitSeconds: expect.any(Number), startDeadline: iso(END), closesAt: iso(END), pendingDecisions: 0 });
    expect(JSON.stringify(activity)).not.toContain("startWindowMinutes");
    const row = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } });
    expect({ deadline: row.deadline?.toISOString(), latePolicy: row.latePolicy }).toEqual({ deadline: iso(END), latePolicy: null });

    const summary = ((await client.get(base())).body.items as TeacherActivitySummary[]).find((item) => item.id === activity.id)!;
    expect({ publishAt: summary.publishAt, deadline: summary.deadline }).toEqual({ publishAt: START, deadline: iso(END) });

    clock.set(START);
    const monitor = await getExamMonitor(client, classId, activity.id);
    expect(monitor.status, JSON.stringify(monitor.body)).toBe(200);
    expect(monitor.body as ExamMonitor).toMatchObject({ startDeadline: iso(END), closesAt: iso(END) });
  });

  it("032/US1-2 032/FR-013 032/FR-006 presença às 20:30: o aluno começa às 20:31 com os 60 minutos inteiros", async () => {
    const activity = await applied();
    clock.set(iso(80 * MINUTE)); // 20:30
    expect((await markPresent(client, classId, activity.id, [students[0]!.id])).status).toBe(200);
    clock.set(iso(81 * MINUTE)); // 20:31
    const student = await studentClient(students[0]!);
    const started = await startExam(student, activity.id);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    expect((started.body as StudentActivity).exam!.endsAt).toBe(iso(141 * MINUTE)); // 21:31
  });

  it("032/US1-3 032/FR-014 presença às 22:01 é recusada com 409 ACTIVITY_PERIOD_ENDED, nada é gravado e o aluno continua sem acesso", async () => {
    const activity = await applied();
    expect((await getRoom(client, classId, activity.id)).body as Room).toMatchObject({ periodEnded: false });

    clock.set(iso(END)); // 22:00: still inside, inclusive
    expect((await getRoom(client, classId, activity.id)).body as Room).toMatchObject({ periodEnded: false });

    clock.set(iso(END + MINUTE)); // 22:01
    expect((await getRoom(client, classId, activity.id)).body as Room).toMatchObject({ periodEnded: true, present: 0 });
    const refused = await markPresent(client, classId, activity.id, [students[1]!.id]);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ statusCode: 409, code: "ACTIVITY_PERIOD_ENDED", message: expect.any(String) });
    expect(await t.prisma.activityAttendance.count({ where: { activityId: activity.id } })).toBe(0);
    expect(await t.prisma.auditEvent.count({ where: { type: "attendance.marked" } })).toBe(0);
    expect(await studentSees(await studentClient(students[1]!), activity.id)).toEqual({ listed: false, detail: 404 });
  });

  it("032/US1-3 032/FR-014 depois do fim, desmarcar quem não começou segue a regra de hoje", async () => {
    const activity = await applied();
    expect((await markPresent(client, classId, activity.id, [students[0]!.id])).status).toBe(200);
    clock.set(iso(END + MINUTE));
    const res = await unmark(client, classId, activity.id, [students[0]!.id]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body as Room).periodEnded).toBe(true);
  });

  it("032/US1-4 032/FR-004 a prova agendada para o dia 30 não aparece para o aluno no dia 29", async () => {
    clock.set(iso(-24 * 60 * MINUTE)); // the 29th, 19:10
    const activity = await applied({ publishAt: START, attendance: "NONE" });
    // Marked present ahead of time: still scheduled, so still invisible.
    expect((await markPresent(client, classId, activity.id, [students[0]!.id])).status).toBe(200);
    expect(await studentSees(await studentClient(students[0]!), activity.id)).toEqual({ listed: false, detail: 404 });
    clock.set(START);
    expect(await studentSees(await studentClient(students[0]!), activity.id)).toEqual({ listed: true, detail: 200 });
  });

  it("032/US1-5 032/FR-002 sem agendamento, o início é a hora do servidor no salvamento", async () => {
    clock.set(iso(-5 * MINUTE)); // 19:05
    const activity = await applied({ publishAt: null });
    expect(activity.publishAt).toBe(iso(-5 * MINUTE));
    expect(activity.deadline).toBe(iso(END));
  });

  it("032/US1-6 032/FR-002 término igual ou antes do início, ou período menor que a duração → 422 INVALID_SCHEDULE e nada criado", async () => {
    // With a scheduled start the contract's refinement already refuses the pair (400, contracts/http-api.md);
    // "Agora" is compared by the service with the server's clock (422).
    const refusals = [
      { overrides: { publishAt: START, deadline: START }, status: 400, code: "VALIDATION_ERROR" },
      { overrides: { publishAt: START, deadline: iso(-MINUTE) }, status: 400, code: "VALIDATION_ERROR" },
      { overrides: { publishAt: START, deadline: iso(59 * MINUTE), durationMinutes: 60 }, status: 400, code: "VALIDATION_ERROR" },
      { overrides: { publishAt: null, deadline: START }, status: 422, code: "INVALID_SCHEDULE" },
      { overrides: { publishAt: null, deadline: iso(30 * MINUTE), durationMinutes: 60 }, status: 422, code: "INVALID_SCHEDULE" },
    ];
    for (const { overrides, status, code } of refusals) {
      const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, attendance: "NONE", ...overrides });
      expect({ status: res.status, code: res.body.code }, JSON.stringify(overrides)).toEqual({ status, code });
    }
    expect(await t.prisma.classActivity.count()).toBe(0);
    // Exactly the duration is enough.
    await applied({ publishAt: START, deadline: iso(60 * MINUTE), durationMinutes: 60 });
  });

  describe("032/US1-7 032/FR-012 o término da prova publicada só é estendido", () => {
    it("032/US1-7 estender para 22:30 move o fim de quem começou às 21:30; antecipar para 21:45 é recusado e nada muda", async () => {
      const activity = await applied();
      expect((await markPresent(client, classId, activity.id, [students[0]!.id])).status).toBe(200);
      clock.set(iso(140 * MINUTE)); // 21:30
      const student = await studentClient(students[0]!);
      const started = await startExam(student, activity.id);
      expect((started.body as StudentActivity).exam!.endsAt).toBe(iso(END)); // cut at 22:00

      const extended = await patch(activity, { deadline: iso(END + 30 * MINUTE) });
      expect(extended.status, JSON.stringify(extended.body)).toBe(200);
      const view = extended.body as TeacherActivity;
      expect(view.deadline).toBe(iso(END + 30 * MINUTE));
      expect(view.exam).toMatchObject({ closesAt: iso(END + 30 * MINUTE), startDeadline: iso(END + 30 * MINUTE) });
      const own = (await student.get(`/api/me/activities/${activity.id}`)).body as StudentActivity;
      expect(own.exam!.endsAt).toBe(iso(END + 30 * MINUTE)); // 22:30 (21:30 + 60)
      const updated = await t.prisma.auditEvent.findMany({ where: { type: "activity.updated" } });
      expect(updated.map((event) => event.metadata)).toEqual([{ classId, fields: ["deadline"] }]);

      const earlier = await patch(view, { deadline: iso(155 * MINUTE) }); // 21:45
      expect({ status: earlier.status, code: earlier.body.code }).toEqual({ status: 422, code: "EXAM_END_CANNOT_MOVE_EARLIER" });
      expect((await teacherView(activity.id)).deadline).toBe(iso(END + 30 * MINUTE));
      expect((await student.get(`/api/me/activities/${activity.id}`)).body.exam.endsAt).toBe(iso(END + 30 * MINUTE));
    });

    it("032/US1-7 fim já passado → 409 ACTIVITY_PERIOD_ENDED", async () => {
      const activity = await applied();
      clock.set(iso(END + MINUTE));
      const res = await patch(activity, { deadline: iso(END + 60 * MINUTE) });
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: "ACTIVITY_PERIOD_ENDED" });
      expect((await teacherView(activity.id)).deadline).toBe(iso(END));
    });

    it("032/US1-7 agendada muda livre; mudar só o início deixando menos que a duração → 422 INVALID_SCHEDULE", async () => {
      clock.set(iso(-24 * 60 * MINUTE));
      const activity = await applied({ publishAt: START });
      const earlier = await patch(activity, { deadline: iso(90 * MINUTE) });
      expect(earlier.status, JSON.stringify(earlier.body)).toBe(200);
      const moved = earlier.body as TeacherActivity;
      expect(moved.deadline).toBe(iso(90 * MINUTE));

      const tooLate = await patch(moved, { publishAt: iso(45 * MINUTE) }); // 45 min left for 60
      expect({ status: tooLate.status, code: tooLate.body.code }).toEqual({ status: 422, code: "INVALID_SCHEDULE" });
      expect((await teacherView(activity.id)).publishAt).toBe(START);
    });
  });

  it("032/SC-001 todos os alunos marcados durante o período começam a prova", async () => {
    const activity = await applied();
    const marks = [0, 100 * MINUTE, END]; // 19:10, 20:50, 22:00
    for (const [index, ms] of marks.entries()) {
      clock.set(iso(ms));
      expect((await markPresent(client, classId, activity.id, [students[index]!.id])).status).toBe(200);
      const started = await startExam(await studentClient(students[index]!), activity.id);
      expect(started.status, JSON.stringify(started.body)).toBe(200);
    }
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(3);
  });
});
