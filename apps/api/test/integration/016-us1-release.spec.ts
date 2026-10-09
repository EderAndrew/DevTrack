import { randomUUID } from "node:crypto";
import { type Room, RoomSchema, type TeacherActivity, type TeacherActivitySummary } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyExercises, applyWork, createActivity, createAttemptRow, createClassWithStudents, saveAnswers, startAttempt } from "../helpers/activities";
import { getRoom, markPresent, postAttendance, unmark } from "../helpers/attendance";
import { DAY, FixedClock, MINUTE } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 016/US1 — the teacher takes the attendance of a work and releases it to the students in the room
 * (016/FR-001…FR-010, FR-020). A work applied since 016 is `PRESENT_ONLY` and invisible to everyone
 * until a student is marked; marking is releasing, with the server's time; every other student gets
 * the same 404 as an activity of another class, audited `student_access.denied` with `NOT_PRESENT`.
 * Exercises and works applied before 016 (`ALL_ENROLLED`) don't change.
 */

const START = "2026-10-01T12:00:00.000Z";
const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
const conflict = (code: string) => ({ statusCode: 409, code, message: expect.any(String) });
type Client = ReturnType<typeof api>;

describe("016/US1 professor faz a chamada e libera o trabalho aos presentes", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let work: WorkFixture;

  const iso = (offset: number) => new Date(clock.now().getTime() + offset).toISOString();
  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const base = () => `/api/classes/${classId}/activities`;
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
  const summaryOf = async (activityId: string) => {
    const res = await client.get(base());
    expect(res.status).toBe(200);
    return (res.body.items as TeacherActivitySummary[]).find((item) => item.id === activityId)!;
  };
  /** What the student sees of `activityId` on every read: listed, counted, opened. */
  const sees = async (student: Client, activityId: string) => {
    const listed = (await student.get("/api/me/activities")).body.items.some((item: { id: string }) => item.id === activityId);
    const dashboard = (await student.get("/api/me/dashboard")).body;
    const onDashboard = JSON.stringify(dashboard).includes(activityId);
    const detail = await student.get(`/api/me/activities/${activityId}`);
    return { listed, onDashboard, detail: detail.status };
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

  it("016/US1-1 016/FR-001 016/FR-006 um trabalho recém-aplicado nasce PRESENT_ONLY, \"Aguardando chamada\" (0 de 3) e invisível a todos", async () => {
    const activity = await applied();
    expect(activity).toMatchObject({ releaseMode: "PRESENT_ONLY", attendance: { present: 0, enrolled: 3 } });
    expect(await summaryOf(activity.id)).toMatchObject({ releaseMode: "PRESENT_ONLY", attendance: { present: 0, enrolled: 3 } });
    expect((await client.get(`${base()}/${activity.id}`)).body).toMatchObject({ attendance: { present: 0, enrolled: 3 } });
    const [published] = await events("activity.published");
    expect(published!.metadata).toMatchObject({ releaseMode: "PRESENT_ONLY" });
    for (const student of students) expect(await sees(await studentClient(student), activity.id)).toEqual({ listed: false, onDashboard: false, detail: 404 });
    expect((await room(activity.id)).students.map((row) => row.roomStatus)).toEqual(["NOT_MARKED", "NOT_MARKED", "NOT_MARKED"]);
  });

  it("016/US1-2 016/FR-003 marcar 2 e confirmar libera a esses 2, que iniciam; a atividade mostra 2 de 3 e a presença tem o horário do servidor", async () => {
    const activity = await applied();
    clock.advance(5 * MINUTE);
    const [a, b, c] = students;
    const marked = await markPresent(client, classId, activity.id, [a!.id, b!.id]);
    expect(marked.status, JSON.stringify(marked.body)).toBe(200);
    const view = RoomSchema.parse(marked.body);
    expect(view).toMatchObject({ releaseMode: "PRESENT_ONLY", present: 2, enrolled: 3 });
    const byId = new Map(view.students.map((row) => [row.studentUserId, row]));
    expect(byId.get(a!.id)).toMatchObject({ markedAt: clock.now().toISOString(), roomStatus: "PRESENT", attemptId: null, openPause: null });
    expect(byId.get(c!.id)).toMatchObject({ markedAt: null, roomStatus: "NOT_MARKED" });
    const rows = await t.prisma.activityAttendance.findMany({ where: { activityId: activity.id }, orderBy: { studentUserId: "asc" } });
    expect(rows.map((row) => [row.studentUserId, row.markedById, row.markedAt.toISOString(), row.classId])).toEqual(
      [a!.id, b!.id].sort().map((id) => [id, teacher.id, clock.now().toISOString(), classId]),
    );
    expect(await summaryOf(activity.id)).toMatchObject({ attendance: { present: 2, enrolled: 3 } });
    for (const student of [a!, b!]) {
      const own = await studentClient(student);
      expect(await sees(own, activity.id)).toEqual({ listed: true, onDashboard: true, detail: 200 });
      expect((await startAttempt(own, activity.id)).status).toBe(200);
    }
    const audited = await events("attendance.marked");
    expect(audited.map((event) => [event.actorUserId, event.targetType, event.targetId, event.metadata])).toEqual(
      expect.arrayContaining([a!, b!].map((s) => [teacher.id, "CLASS_ACTIVITY", activity.id, { classId, studentUserId: s.id }])),
    );
    expect(audited).toHaveLength(2);
  });

  it("016/US1-3 016/FR-008 016/FR-010 o aluno não marcado: some de lista e dashboard, e detalhe, início e salvamento respondem 404 com student_access.denied NOT_PRESENT", async () => {
    const activity = await applied();
    const [a, , c] = students;
    expect((await markPresent(client, classId, activity.id, [a!.id])).status).toBe(200);
    const absent = await studentClient(c!);
    expect(await sees(absent, activity.id)).toMatchObject({ listed: false, onDashboard: false });
    const questionId = activity.questions[0]!.id;
    for (const res of [
      await absent.get(`/api/me/activities/${activity.id}`),
      await startAttempt(absent, activity.id),
      await saveAnswers(absent, activity.id, [{ questionId, answer: { kind: "ALTERNATIVE", alternativeId: null }, baseRevision: 0 }]),
    ]) {
      expect({ status: res.status, body: res.body }).toEqual({ status: 404, body: NOT_FOUND });
    }
    // The same answer as an activity that doesn't exist: nothing tells them it does.
    expect((await absent.get(`/api/me/activities/${randomUUID()}`)).body).toEqual(NOT_FOUND);
    const denied = (await events("student_access.denied")).filter((event) => event.actorUserId === c!.id && event.targetId === activity.id);
    // The detail read of `sees`, then detail, start and save.
    expect(denied.map((event) => (event.metadata as { reason: string }).reason)).toEqual(["NOT_PRESENT", "NOT_PRESENT", "NOT_PRESENT", "NOT_PRESENT"]);
    expect(await t.prisma.activityAttempt.count({ where: { studentUserId: c!.id } })).toBe(0);
    // FR-010: the student's detail never carries the attendance of the class.
    const own = (await (await studentClient(a!)).get(`/api/me/activities/${activity.id}`)).body;
    expect(JSON.stringify(own)).not.toContain(c!.id);
    expect(own).not.toHaveProperty("attendance");
  });

  it("016/US1-4 trabalho agendado: a presença marcada antes da publicação fica registrada, mas o aluno só o vê quando a data chega", async () => {
    const activity = await applied({ publishAt: iso(DAY), deadline: iso(3 * DAY) });
    const [a] = students;
    expect((await markPresent(client, classId, activity.id, [a!.id])).status).toBe(200);
    expect((await room(activity.id)).present).toBe(1);
    const own = await studentClient(a!);
    expect(await sees(own, activity.id)).toEqual({ listed: false, onDashboard: false, detail: 404 });
    expect((await startAttempt(own, activity.id)).status).toBe(404);
    clock.advance(DAY);
    expect(await sees(own, activity.id)).toEqual({ listed: true, onDashboard: true, detail: 200 });
  });

  it("016/US1-5 016/SC-005 turma de 40: \"Marcar todos\" com 3 desmarcados libera aos 37 num único lote", async () => {
    const big = await createClassWithStudents(t, teacher.id, { subjectId: work.subjectId, students: 40 });
    classId = big.schoolClass.id;
    const activity = await applied();
    const left = big.students.slice(0, 3).map((student) => student.id);
    const ids = big.students.slice(3).map((student) => student.id);
    const marked = await markPresent(client, classId, activity.id, ids);
    expect(marked.status).toBe(200);
    expect(RoomSchema.parse(marked.body)).toMatchObject({ present: 37, enrolled: 40 });
    expect(await t.prisma.activityAttendance.count({ where: { activityId: activity.id } })).toBe(37);
    expect(await events("attendance.marked")).toHaveLength(37);
    expect(await summaryOf(activity.id)).toMatchObject({ attendance: { present: 37, enrolled: 40 } });
    expect((await (await studentClient(big.students[3]!)).get(`/api/me/activities/${activity.id}`)).status).toBe(200);
    expect((await (await studentClient(big.students[0]!)).get(`/api/me/activities/${activity.id}`)).status).toBe(404);
    expect(left).toHaveLength(3);
  });

  it("016/US1-6 016/FR-007 016/SC-006 Exercícios: sem chamada (409 ATTENDANCE_NOT_REQUIRED) e visíveis a todos os matriculados", async () => {
    const exercise = await createExercise(t, teacher.id, { difficulty: "BASIC" });
    const res = await applyExercises(client, classId, [exercise.id], { acknowledgeOutOfScope: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ releaseMode: "ALL_ENROLLED", attendance: null });
    for (const student of students) expect((await (await studentClient(student)).get(`/api/me/activities/${res.body.id}`)).status).toBe(200);
    expect((await getRoom(client, classId, res.body.id)).body).toEqual(conflict("ATTENDANCE_NOT_REQUIRED"));
    expect((await markPresent(client, classId, res.body.id, [students[0]!.id])).body).toEqual(conflict("ATTENDANCE_NOT_REQUIRED"));
    expect(await t.prisma.activityAttendance.count()).toBe(0);
  });

  it("016/US1-7 professor de outra turma → 404; aluno e MANAGER → 403; nada muda", async () => {
    const activity = await applied();
    const other = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })) });
    expect((await getRoom(other, classId, activity.id)).body).toEqual(NOT_FOUND);
    expect((await markPresent(other, classId, activity.id, [students[0]!.id])).body).toEqual(NOT_FOUND);
    for (const who of [await studentClient(students[0]!), api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["MANAGER"] })) })]) {
      expect((await getRoom(who, classId, activity.id)).status).toBe(403);
      expect((await markPresent(who, classId, activity.id, [students[0]!.id])).status).toBe(403);
    }
    expect(await t.prisma.activityAttendance.count()).toBe(0);
  });

  it("016/FR-001 um trabalho aplicado antes da 016 (ALL_ENROLLED) segue visível a todos e não tem chamada", async () => {
    const schoolClass = { id: classId, teacherId: teacher.id };
    const { activity } = await createActivity(t, schoolClass, {
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
      publishAt: new Date(clock.now().getTime() - DAY),
      deadline: new Date(clock.now().getTime() + 7 * DAY),
    });
    expect(await summaryOf(activity.id)).toMatchObject({ releaseMode: "ALL_ENROLLED", attendance: null });
    for (const student of students) expect((await (await studentClient(student)).get(`/api/me/activities/${activity.id}`)).status).toBe(200);
    expect((await getRoom(client, classId, activity.id)).body).toEqual(conflict("ATTENDANCE_NOT_REQUIRED"));
  });

  it("016/FR-002 cada atividade tem a própria chamada: marcar na atividade A não libera a B da mesma turma", async () => {
    const first = await applied();
    const second = await applied();
    const [a] = students;
    expect((await markPresent(client, classId, first.id, [a!.id])).status).toBe(200);
    const own = await studentClient(a!);
    expect((await own.get(`/api/me/activities/${first.id}`)).status).toBe(200);
    expect((await own.get(`/api/me/activities/${second.id}`)).status).toBe(404);
    expect((await room(second.id)).present).toBe(0);
  });

  it("016/FR-020 016/FR-003 a sala mostra a situação de cada aluno por nome: não marcado, presente, respondendo, fora da sala e entregou", async () => {
    const big = await createClassWithStudents(t, teacher.id, { subjectId: work.subjectId, students: 5 });
    classId = big.schoolClass.id;
    const activity = await applied();
    const [notMarked, present, answering, out, submitted] = big.students;
    expect((await markPresent(client, classId, activity.id, [present!.id, answering!.id, out!.id, submitted!.id])).status).toBe(200);
    const answeringAttempt = await createAttemptRow(t, activity.id, answering!.id);
    const outAttempt = await createAttemptRow(t, activity.id, out!.id);
    await createAttemptRow(t, activity.id, submitted!.id, { submission: {} });
    const pause = await t.prisma.attemptPause.create({
      data: {
        attemptId: outAttempt.attemptId,
        activityId: activity.id,
        studentUserId: out!.id,
        initiatedBy: "STUDENT",
        reason: "WATER",
        startedAt: clock.now(),
        startedById: out!.id,
      },
    });
    clock.advance(3 * MINUTE);
    const view = await room(activity.id);
    expect(view.students.map((row) => row.name)).toEqual([...view.students.map((row) => row.name)].sort((x, y) => x.localeCompare(y, "pt-BR")));
    const status = new Map(view.students.map((row) => [row.studentUserId, row]));
    expect(status.get(notMarked!.id)).toMatchObject({ roomStatus: "NOT_MARKED", attemptId: null });
    expect(status.get(present!.id)).toMatchObject({ roomStatus: "PRESENT", attemptId: null });
    expect(status.get(answering!.id)).toMatchObject({ roomStatus: "ANSWERING", attemptId: answeringAttempt.attemptId, openPause: null });
    expect(status.get(out!.id)).toMatchObject({
      roomStatus: "OUT_OF_ROOM",
      openPause: { id: pause.id, initiatedBy: "STUDENT", reason: "WATER", note: null, endedAt: null, endedBy: null, seconds: 180 },
    });
    expect(status.get(submitted!.id)).toMatchObject({ roomStatus: "SUBMITTED" });
    expect(view).toMatchObject({ present: 4, enrolled: 5 });
  });

  describe("lote de presença: tudo ou nada", () => {
    it("016/FR-003 marcar de novo não muda o horário nem audita; id fora da turma → 422 STUDENT_NOT_IN_CLASS sem gravar nada", async () => {
      const activity = await applied();
      const [a, b] = students;
      expect((await markPresent(client, classId, activity.id, [a!.id])).status).toBe(200);
      const first = (await room(activity.id)).students.find((row) => row.studentUserId === a!.id)!.markedAt;
      clock.advance(MINUTE);
      expect((await markPresent(client, classId, activity.id, [a!.id])).status).toBe(200);
      expect((await room(activity.id)).students.find((row) => row.studentUserId === a!.id)!.markedAt).toBe(first);
      expect(await events("attendance.marked")).toHaveLength(1);
      const stranger = await createUser(t, { roles: ["STUDENT"] });
      for (const id of [stranger.id, randomUUID()]) {
        const res = await markPresent(client, classId, activity.id, [b!.id, id]);
        expect(res.body).toEqual({ statusCode: 422, code: "STUDENT_NOT_IN_CLASS", message: expect.any(String) });
      }
      expect(await t.prisma.activityAttendance.count({ where: { activityId: activity.id } })).toBe(1);
    });

    it("016/FR-005 desmarcar quem já iniciou → 409 ATTENDANCE_STARTED com os ids, e a marcação do mesmo lote não entra", async () => {
      const activity = await applied();
      const [a, b, c] = students;
      expect((await markPresent(client, classId, activity.id, [a!.id, b!.id])).status).toBe(200);
      expect((await startAttempt(await studentClient(a!), activity.id)).status).toBe(200);
      const res = await postAttendance(client, classId, activity.id, { mark: [c!.id], unmark: [a!.id, b!.id] });
      expect(res.body).toEqual({ ...conflict("ATTENDANCE_STARTED"), details: { studentUserIds: [a!.id] } });
      expect((await room(activity.id)).present).toBe(2);
      // Unmarking only the one who didn't start passes and is audited.
      expect((await unmark(client, classId, activity.id, [b!.id])).status).toBe(200);
      expect((await events("attendance.unmarked")).map((event) => event.metadata)).toEqual([{ classId, studentUserId: b!.id }]);
    });

    it("016/FR-004 atividade encerrada → 409 ACTIVITY_CLOSED; lote vazio ou com o mesmo id nas duas listas → 400", async () => {
      const activity = await applied();
      const [a] = students;
      expect((await postAttendance(client, classId, activity.id, {})).status).toBe(400);
      expect((await postAttendance(client, classId, activity.id, { mark: [a!.id], unmark: [a!.id] })).status).toBe(400);
      expect((await client.post(`${base()}/${activity.id}/attendance`, { mark: [a!.id], unmark: [], markedAt: iso(0) })).status).toBe(400);
      expect((await client.post(`${base()}/${activity.id}/close`, {})).status).toBe(200);
      expect((await markPresent(client, classId, activity.id, [a!.id])).body).toEqual(conflict("ACTIVITY_CLOSED"));
      expect(await t.prisma.activityAttendance.count()).toBe(0);
    });
  });
});
