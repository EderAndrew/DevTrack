import { type Room, RoomSchema, type StudentActivity, type TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyWork, createClassWithStudents, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { getRoom, markPresent, postAttendance, unmark } from "../helpers/attendance";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 016/US2 — the late student and the presence marked by mistake (016/FR-004, FR-005, SC-002). Marking
 * releases the work at once, whenever the activity is ACTIVE: after the publication, after the
 * deadline and with others already answering, always with the class's deadline. Unmarking takes the
 * work away only while the student has no attempt; after the start it is `409 ATTENDANCE_STARTED`
 * and the teacher pauses the student instead (US5). The same batch twice is one presence.
 */

const START = "2026-10-01T12:00:00.000Z";
const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
type Client = ReturnType<typeof api>;

describe("016/US2 aluno atrasado e presença marcada por engano", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let work: WorkFixture;

  const iso = (offset: number) => new Date(clock.now().getTime() + offset).toISOString();
  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  /** A work applied through the route, with no attendance taken. */
  const applied = async (overrides: Parameters<typeof applyWork>[3] = {}) => {
    const res = await applyWork(client, classId, work.id, { acknowledgeOutOfScope: true, attendance: "NONE", ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  const room = async (activityId: string) => {
    const res = await getRoom(client, classId, activityId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return RoomSchema.parse(res.body) satisfies Room;
  };
  const rowOf = async (activityId: string, studentUserId: string) => (await room(activityId)).students.find((row) => row.studentUserId === studentUserId)!;
  /** What the student sees of `activityId`: listed and opened. */
  const sees = async (student: Client, activityId: string) => {
    const listed = (await student.get("/api/me/activities")).body.items.some((item: { id: string }) => item.id === activityId);
    const detail = await student.get(`/api/me/activities/${activityId}`);
    return { listed, detail: detail.status };
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
    work = await createWork(t, teacher.id, { syllabus, status: "APPROVED", totalGrade: "1.00" });
  });

  it("016/US2-1 trabalho já liberado a outros: o aluno atrasado não o vê em lista nem detalhe", async () => {
    const activity = await applied();
    const [a, b, late] = students;
    expect((await markPresent(client, classId, activity.id, [a!.id, b!.id])).status).toBe(200);
    expect((await startAttempt(await studentClient(a!), activity.id)).status).toBe(200);
    const own = await studentClient(late!);
    expect(await sees(own, activity.id)).toEqual({ listed: false, detail: 404 });
    expect((await own.get(`/api/me/activities/${activity.id}`)).body).toEqual(NOT_FOUND);
    expect((await rowOf(activity.id, late!.id)).roomStatus).toBe("NOT_MARKED");
  });

  it("016/US2-2 016/FR-004 016/SC-002 marcado depois da publicação e com outros respondendo, o atrasado vê o trabalho na leitura seguinte e inicia com o prazo da turma", async () => {
    const deadline = iso(2 * HOUR);
    const activity = await applied({ deadline });
    const [a, b, late] = students;
    expect((await markPresent(client, classId, activity.id, [a!.id, b!.id])).status).toBe(200);
    const answering = await studentClient(a!);
    expect((await startAttempt(answering, activity.id)).status).toBe(200);
    const questionId = activity.questions[0]!.id;
    expect((await saveAnswers(answering, activity.id, [{ questionId, answer: { kind: "ALTERNATIVE", alternativeId: null }, baseRevision: 0 }])).status).toBe(200);

    clock.advance(20 * MINUTE);
    const own = await studentClient(late!);
    expect(await sees(own, activity.id)).toEqual({ listed: false, detail: 404 });
    const marked = await markPresent(client, classId, activity.id, [late!.id]);
    expect(marked.status, JSON.stringify(marked.body)).toBe(200);
    expect(RoomSchema.parse(marked.body).students.find((row) => row.studentUserId === late!.id)).toMatchObject({
      markedAt: clock.now().toISOString(),
      roomStatus: "PRESENT",
    });

    // SC-002: the very next read (the portal polls every 5 s) already lists it; nothing else to do.
    expect(await sees(own, activity.id)).toEqual({ listed: true, detail: 200 });
    const detail = (await own.get(`/api/me/activities/${activity.id}`)).body as StudentActivity;
    expect(detail).toMatchObject({ deadline, canAnswer: true });
    expect((await startAttempt(own, activity.id)).status).toBe(200);
    // The class's deadline: nothing was moved for the late student, and the others go on answering.
    expect((await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } })).deadline!.toISOString()).toBe(deadline);
    expect((await rowOf(activity.id, a!.id)).roomStatus).toBe("ANSWERING");
    expect((await rowOf(activity.id, late!.id)).roomStatus).toBe("ANSWERING");
  });

  it("016/FR-004 marcar depois do prazo (ACCEPT_MARKED) libera o trabalho com o mesmo prazo, e o início fica marcado como atrasado", async () => {
    const deadline = iso(HOUR);
    const activity = await applied({ deadline, latePolicy: "ACCEPT_MARKED" });
    const [a, late] = students;
    expect((await markPresent(client, classId, activity.id, [a!.id])).status).toBe(200);
    clock.advance(2 * HOUR);
    expect((await markPresent(client, classId, activity.id, [late!.id])).status).toBe(200);
    const own = await studentClient(late!);
    const detail = await own.get(`/api/me/activities/${activity.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ deadline, status: "OVERDUE", canAnswer: true });
    expect((await startAttempt(own, activity.id)).status).toBe(200);
    const [started] = await events("activity_attempt.started");
    expect(started!.metadata).toMatchObject({ activityId: activity.id, afterDeadline: true });
  });

  it("016/US2-3 desmarcar quem não iniciou: o trabalho some para ele, a sala o mostra não marcado e o fato é auditado", async () => {
    const activity = await applied();
    const [a, mistaken] = students;
    expect((await markPresent(client, classId, activity.id, [a!.id, mistaken!.id])).status).toBe(200);
    const own = await studentClient(mistaken!);
    expect(await sees(own, activity.id)).toEqual({ listed: true, detail: 200 });

    clock.advance(MINUTE);
    const res = await unmark(client, classId, activity.id, [mistaken!.id]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(RoomSchema.parse(res.body)).toMatchObject({ present: 1, enrolled: 3 });
    expect((await rowOf(activity.id, mistaken!.id)).roomStatus).toBe("NOT_MARKED");
    expect(await sees(own, activity.id)).toEqual({ listed: false, detail: 404 });
    expect((await startAttempt(own, activity.id)).status).toBe(404);
    expect((await client.get(`/api/classes/${classId}/activities/${activity.id}`)).body).toMatchObject({ attendance: { present: 1, enrolled: 3 } });
    const unmarked = await events("attendance.unmarked");
    expect(unmarked.map((event) => [event.actorUserId, event.targetType, event.targetId, event.metadata])).toEqual([
      [teacher.id, "CLASS_ACTIVITY", activity.id, { classId, studentUserId: mistaken!.id }],
    ]);
    // Unmarking someone who isn't marked changes nothing and audits nothing.
    expect((await unmark(client, classId, activity.id, [mistaken!.id])).status).toBe(200);
    expect(await events("attendance.unmarked")).toHaveLength(1);
    // Marked again, the first presence is gone: the new one carries the new time.
    clock.advance(MINUTE);
    expect((await markPresent(client, classId, activity.id, [mistaken!.id])).status).toBe(200);
    expect((await rowOf(activity.id, mistaken!.id)).markedAt).toBe(clock.now().toISOString());
  });

  it("016/US2-4 016/FR-005 desmarcar quem já iniciou → 409 ATTENDANCE_STARTED: a presença e a tentativa ficam, nada é auditado", async () => {
    const activity = await applied();
    const [a] = students;
    expect((await markPresent(client, classId, activity.id, [a!.id])).status).toBe(200);
    const own = await studentClient(a!);
    expect((await startAttempt(own, activity.id)).status).toBe(200);
    const res = await unmark(client, classId, activity.id, [a!.id]);
    expect(res.body).toEqual({ statusCode: 409, code: "ATTENDANCE_STARTED", message: expect.any(String), details: { studentUserIds: [a!.id] } });
    expect(await t.prisma.activityAttendance.count({ where: { activityId: activity.id, studentUserId: a!.id } })).toBe(1);
    expect(await events("attendance.unmarked")).toHaveLength(0);
    expect(await sees(own, activity.id)).toEqual({ listed: true, detail: 200 });
    expect((await rowOf(activity.id, a!.id)).roomStatus).toBe("ANSWERING");
  });

  it("016/US2-5 dois lotes iguais (duplo clique, duas abas) → uma presença, um evento, as duas respostas 200", async () => {
    const activity = await applied();
    const [a] = students;
    const responses = await Promise.all([markPresent(client, classId, activity.id, [a!.id]), postAttendance(client, classId, activity.id, { mark: [a!.id] })]);
    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    expect(await t.prisma.activityAttendance.count({ where: { activityId: activity.id } })).toBe(1);
    expect(await events("attendance.marked")).toHaveLength(1);
    expect((await room(activity.id)).present).toBe(1);
  });

  it("016/FR-004 a chamada fica aberta enquanto a atividade estiver ativa: marcar no último dia, depois de vários alunos entregarem", async () => {
    const activity = await applied({ deadline: iso(3 * DAY) });
    const [a, b, late] = students;
    expect((await markPresent(client, classId, activity.id, [a!.id, b!.id])).status).toBe(200);
    for (const student of [a!, b!]) {
      const own = await studentClient(student);
      expect((await startAttempt(own, activity.id)).status).toBe(200);
      expect((await submitAttempt(own, activity.id)).status).toBe(200);
    }
    clock.advance(2 * DAY + 23 * HOUR);
    expect((await markPresent(client, classId, activity.id, [late!.id])).status).toBe(200);
    expect(await sees(await studentClient(late!), activity.id)).toEqual({ listed: true, detail: 200 });
    expect((await room(activity.id)).students.map((row) => row.roomStatus).sort()).toEqual(["PRESENT", "SUBMITTED", "SUBMITTED"]);
  });
});
