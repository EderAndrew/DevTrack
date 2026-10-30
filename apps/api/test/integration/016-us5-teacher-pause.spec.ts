import {
  type Answer,
  type Room,
  RoomSchema,
  type StudentActivity,
  StudentActivitySchema,
  type StudentPause,
  StudentPauseSchema,
  type TeacherPause,
  TeacherPauseSchema,
} from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type CreateActivityOptions, type CreatedActivity, createActivity, createClassWithStudents, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { declareExit, getMyPause, getRoom, markPresent, pauseStudent, releasePause } from "../helpers/attendance";
import { DAY, FixedClock, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 016/US5 — the teacher pauses a student ("Pausar aluno", 016/FR-016): the same pause as the declared
 * exit of US3, with `initiatedBy: TEACHER` and the reason `TEACHER` ("Pausado pelo professor"), written
 * under the target attempt's lock and audited with the teacher as actor. Every session of the student
 * loses the questions until the teacher releases the return; an open pause comes back as it is (200),
 * and a student who has not started or already submitted is refused with 409.
 */

const START = "2026-10-01T12:00:00.000Z";
const STATEMENT = "MARCADOR-ENUNCIADO-016 Explique o encapsulamento.";
const ANSWER_TEXT = "MARCADOR-RESPOSTA-ALUNO-016 a classe protege o próprio estado";
type ApiClient = ReturnType<typeof api>;

describe("016/US5 professor pausa um aluno", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let other: TestUser;
  let teacherClient: ApiClient;
  let client: ApiClient;
  /** Another session of the same student: "o celular". */
  let phone: ApiClient;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const work = (options: CreateActivityOptions = {}): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 50, statement: STATEMENT, alternatives: ["Protege o estado", "Herança múltipla", "Sobrecarga"], correctIndex: 0 },
        { type: "OPEN_ANSWER", valueCents: 50, statement: STATEMENT, expectedAnswer: "O objeto controla o acesso aos dados." },
      ],
      ...options,
    });
  const answering = async (options: CreateActivityOptions = {}): Promise<CreatedActivity> => {
    const created = await work(options);
    expect((await markPresent(teacherClient, schoolClass.id, created.activity.id, [student.id])).status).toBe(200);
    const res = await startAttempt(client, created.activity.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return created;
  };
  const twoAnswers = (created: CreatedActivity): { questionId: string; answer: Answer; baseRevision: number }[] => [
    { questionId: created.questionIds[0]!, answer: { kind: "ALTERNATIVE", alternativeId: created.alternativeIds[0]![0]! }, baseRevision: 0 },
    { questionId: created.questionIds[1]!, answer: { kind: "TEXT", text: ANSWER_TEXT }, baseRevision: 0 },
  ];
  const pause = async (activityId: string, studentUserId = student.id, expected = 201): Promise<TeacherPause> => {
    const res = await pauseStudent(teacherClient, schoolClass.id, activityId, studentUserId);
    expect(res.status, JSON.stringify(res.body)).toBe(expected);
    return TeacherPauseSchema.parse(res.body);
  };
  const release = async (activityId: string, pauseId: string): Promise<TeacherPause> => {
    const res = await releasePause(teacherClient, schoolClass.id, activityId, pauseId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return TeacherPauseSchema.parse(res.body);
  };
  const detail = async (as: ApiClient, activityId: string): Promise<StudentActivity> => {
    const res = await as.get(`/api/me/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return StudentActivitySchema.parse(res.body);
  };
  const room = async (activityId: string): Promise<Room> => {
    const res = await getRoom(teacherClient, schoolClass.id, activityId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return RoomSchema.parse(res.body);
  };
  const audits = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const attemptOf = (activityId: string) => t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId: student.id } });
  const codeOf = (res: { status: number; body: { code?: string } }) => ({ status: res.status, code: res.body.code });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createClassWithStudents(t, teacher.id, { students: 2 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
    other = created.students[1]!;
    client = api(t, { cookie: await loginAs(t, student) });
    phone = api(t, { cookie: await loginAs(t, student) });
  });

  describe("016/FR-016 a pausa pelo professor", () => {
    it("016/US5-1 016/FR-016 a tentativa pausa com o motivo do professor; o aluno perde as questões em toda sessão e o painel mostra a saída", async () => {
      const created = await answering();
      const { activity } = created;
      expect((await saveAnswers(client, activity.id, twoAnswers(created))).status).toBe(200);
      clock.advance(10 * MINUTE);
      const paused = await pause(activity.id);
      expect(paused).toEqual({
        id: expect.any(String),
        studentUserId: student.id,
        initiatedBy: "TEACHER",
        reason: "TEACHER",
        note: null,
        startedAt: clock.now().toISOString(),
        endedAt: null,
        endedBy: null,
        seconds: 0,
      });
      const stored = await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: paused.id } });
      expect({ startedById: stored.startedById, studentUserId: stored.studentUserId, attemptId: stored.attemptId }).toEqual({
        startedById: teacher.id,
        studentUserId: student.id,
        attemptId: (await attemptOf(activity.id)).id,
      });

      const expected: StudentPause = StudentPauseSchema.parse({
        id: paused.id,
        initiatedBy: "TEACHER",
        reason: "TEACHER",
        note: null,
        startedAt: paused.startedAt,
        endedAt: null,
      });
      for (const session of [client, phone]) {
        const view = await detail(session, activity.id);
        expect(view.pause).toEqual(expected);
        expect(view.questions).toEqual([]);
        expect(view.attempt!.answers).toEqual([]);
        expect(JSON.stringify(view)).not.toContain("MARCADOR");
        expect((await getMyPause(session, activity.id)).body).toEqual({ pause: expected });
        expect(codeOf(await saveAnswers(session, activity.id, twoAnswers(created)))).toEqual({ status: 409, code: "ATTEMPT_PAUSED" });
      }

      clock.advance(2 * MINUTE);
      const row = (await room(activity.id)).students.find((student_) => student_.studentUserId === student.id)!;
      expect(row.roomStatus).toBe("OUT_OF_ROOM");
      expect(row.openPause).toMatchObject({ id: paused.id, initiatedBy: "TEACHER", reason: "TEACHER", seconds: 120 });
      // The other student's attempt was never touched.
      expect(await t.prisma.attemptPause.count({ where: { studentUserId: other.id } })).toBe(0);
    });

    it("016/US5-1 016/FR-016 auditada como attempt_pause.started com o professor como ator, só ids e enums", async () => {
      const { activity } = await answering();
      const paused = await pause(activity.id);
      const attempt = await attemptOf(activity.id);
      const started = await audits("attempt_pause.started");
      expect(started.map((event) => ({ actor: event.actorUserId, targetType: event.targetType, target: event.targetId, metadata: event.metadata }))).toEqual([
        {
          actor: teacher.id,
          targetType: "ACTIVITY_ATTEMPT",
          target: attempt.id,
          metadata: { activityId: activity.id, pauseId: paused.id, initiatedBy: "TEACHER", reason: "TEACHER" },
        },
      ]);
    });

    it("016/US5-2 016/FR-016 o professor libera o retorno e o aluno retoma com as respostas salvas, como na US3", async () => {
      const created = await answering();
      const { activity } = created;
      expect((await saveAnswers(client, activity.id, twoAnswers(created))).status).toBe(200);
      const paused = await pause(activity.id);
      clock.advance(5 * MINUTE);
      const released = await release(activity.id, paused.id);
      expect(released).toMatchObject({ id: paused.id, endedBy: "RELEASE", endedAt: clock.now().toISOString(), seconds: 300 });

      expect((await getMyPause(phone, activity.id)).body).toEqual({ pause: null });
      const back = await detail(client, activity.id);
      expect(back.pause).toBeNull();
      expect(back.questions).toHaveLength(2);
      const byQuestion = <T extends { questionId: string }>(items: T[]) => [...items].sort((a, b) => a.questionId.localeCompare(b.questionId));
      expect(byQuestion(back.attempt!.answers)).toEqual(
        byQuestion(twoAnswers(created).map(({ questionId, answer }) => ({ questionId, answer, revision: 1 }))),
      );
      expect((await submitAttempt(client, activity.id)).status).toBe(200);
    });

    it("016/US5-1 016/FR-016 pausa já aberta → a mesma (200), sem nova linha nem evento; a do aluno também volta como está", async () => {
      const { activity } = await answering();
      const first = await pause(activity.id);
      clock.advance(MINUTE);
      const again = await pause(activity.id, student.id, 200);
      expect(again).toEqual({ ...first, seconds: 60 });

      const declared = await answering();
      const own = await declareExit(client, declared.activity.id, { reason: "BATHROOM" });
      expect(own.status).toBe(201);
      const teacherSees = await pause(declared.activity.id, student.id, 200);
      expect(teacherSees).toMatchObject({ id: own.body.id, initiatedBy: "STUDENT", reason: "BATHROOM" });

      expect(await t.prisma.attemptPause.count()).toBe(2);
      expect(await audits("attempt_pause.started")).toHaveLength(2);
    });
  });

  describe("016/FR-016 recusas", () => {
    it("016/US5-3 016/FR-016 quem não iniciou → 409 NOT_STARTED; quem entregou → 409 ATTEMPT_ALREADY_SUBMITTED; não marcado → 409 NOT_STARTED", async () => {
      const created = await work();
      expect(codeOf(await pauseStudent(teacherClient, schoolClass.id, created.activity.id, student.id))).toEqual({ status: 409, code: "NOT_STARTED" });
      expect((await markPresent(teacherClient, schoolClass.id, created.activity.id, [student.id])).status).toBe(200);
      expect(codeOf(await pauseStudent(teacherClient, schoolClass.id, created.activity.id, student.id))).toEqual({ status: 409, code: "NOT_STARTED" });
      expect((await startAttempt(client, created.activity.id)).status).toBe(200);
      expect((await submitAttempt(client, created.activity.id, twoAnswers(created))).status).toBe(200);
      expect(codeOf(await pauseStudent(teacherClient, schoolClass.id, created.activity.id, student.id))).toEqual({
        status: 409,
        code: "ATTEMPT_ALREADY_SUBMITTED",
      });
      expect(await t.prisma.attemptPause.count()).toBe(0);
      expect(await audits("attempt_pause.started")).toHaveLength(0);
    });

    it("016/FR-016 atividade encerrada → 409 ACTIVITY_CLOSED; trabalho ALL_ENROLLED → 409 ATTENDANCE_NOT_REQUIRED", async () => {
      const closed = await answering();
      expect((await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${closed.activity.id}/close`, {})).status).toBe(200);
      expect(codeOf(await pauseStudent(teacherClient, schoolClass.id, closed.activity.id, student.id))).toEqual({ status: 409, code: "ACTIVITY_CLOSED" });

      const { activity } = await createActivity(t, schoolClass, { publishAt: at(-DAY), deadline: at(7 * DAY) });
      expect((await startAttempt(client, activity.id)).status).toBe(200);
      expect(codeOf(await pauseStudent(teacherClient, schoolClass.id, activity.id, student.id))).toEqual({
        status: 409,
        code: "ATTENDANCE_NOT_REQUIRED",
      });
      expect(await t.prisma.attemptPause.count()).toBe(0);
    });

    it("016/FR-016 aluno de fora da turma, id inexistente ou atividade de outra turma → 404", async () => {
      const { activity } = await answering();
      const outsider = await createUser(t, { roles: ["STUDENT"] });
      for (const id of [outsider.id, teacher.id, "00000000-0000-4000-8000-000000000000"]) {
        expect((await pauseStudent(teacherClient, schoolClass.id, activity.id, id)).status, id).toBe(404);
      }
      const otherClass = await createClassWithStudents(t, teacher.id, { students: 1 });
      expect((await pauseStudent(teacherClient, otherClass.schoolClass.id, activity.id, student.id)).status).toBe(404);

      const otherTeacher = await createUser(t, { roles: ["TEACHER"] });
      const otherClient = api(t, { cookie: await loginAs(t, otherTeacher) });
      expect((await pauseStudent(otherClient, schoolClass.id, activity.id, student.id)).status).toBe(404);
      expect((await pauseStudent(client, schoolClass.id, activity.id, student.id)).status).toBe(403);
      expect(await t.prisma.attemptPause.count()).toBe(0);
    });

    it("016/FR-016 o corpo é vazio: campos do servidor → 400", async () => {
      const { activity } = await answering();
      for (const body of [{ reason: "TEACHER" }, { initiatedBy: "TEACHER" }, { note: "x" }]) {
        const res = await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${activity.id}/students/${student.id}/pause`, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
      }
      expect(await t.prisma.attemptPause.count()).toBe(0);
    });
  });
});
