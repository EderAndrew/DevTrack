import {
  type AttemptPauses,
  AttemptPausesSchema,
  type StudentActivity,
  StudentActivitySchema,
  type TeacherActivity,
  TeacherActivitySchema,
  TeacherActivitySummarySchema,
  TeacherAttemptSchema,
} from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import {
  type CreateActivityOptions,
  type CreatedActivity,
  createActivity,
  createClassWithStudents,
  getAttempt,
  gradeAttempt,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "../helpers/activities";
import { declareExit, getAttemptPauses, markPresent, releasePause } from "../helpers/attendance";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 016/US4 — the teacher sees the attendance and the pauses when grading (016/FR-019, FR-021, SC-008,
 * research M9). In the roster of a `PRESENT_ONLY` work a student not marked is "Ausente" (`ABSENT`),
 * never "Não entregou" (`MISSED`) nor counted in `missed`/`missedCount`; each row carries the time of
 * the presence, the number of pauses and the time away, derived on every read. The review lists the
 * pauses of an attempt with reason, note, exit, return, duration and who started each one. The
 * student sees their own pauses in the history only after the submission. Nothing of it changes a
 * grade or submits anything.
 */

const START = "2026-10-01T12:00:00.000Z";
const NOTE = "Fui buscar o carregador";
const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
type ApiClient = ReturnType<typeof api>;

describe("016/US4 professor vê presença e pausas ao corrigir", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: ApiClient;
  let schoolClass: SchoolClass;
  /** absent: never marked; paused: leaves the room; steady: never leaves. */
  let absent: TestUser;
  let paused: TestUser;
  let steady: TestUser;
  let pausedClient: ApiClient;
  let steadyClient: ApiClient;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const work = (options: CreateActivityOptions = {}): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 50, alternatives: ["Protege o estado", "Herança múltipla", "Sobrecarga"], correctIndex: 0 },
        { type: "OPEN_ANSWER", valueCents: 50, expectedAnswer: "O objeto controla o acesso aos dados." },
      ],
      ...options,
    });
  const answers = (created: CreatedActivity) => [
    { questionId: created.questionIds[0]!, answer: { kind: "ALTERNATIVE" as const, alternativeId: created.correctAlternativeIds[0]! }, baseRevision: 0 },
    { questionId: created.questionIds[1]!, answer: { kind: "TEXT" as const, text: "A classe protege o próprio estado." }, baseRevision: 0 },
  ];
  const ok = <T>(res: { status: number; body: unknown }, status = 200): T => {
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    return res.body as T;
  };
  const activityView = async (activityId: string): Promise<TeacherActivity> =>
    TeacherActivitySchema.parse(ok(await teacherClient.get(`/api/classes/${schoolClass.id}/activities/${activityId}`)));
  const rowOf = async (activityId: string, studentUserId: string) => (await activityView(activityId)).roster.find((row) => row.studentUserId === studentUserId)!;
  const listed = async (activityId: string) => {
    const body = ok<{ items: unknown[] }>(await teacherClient.get(`/api/classes/${schoolClass.id}/activities`));
    return TeacherActivitySummarySchema.array()
      .parse(body.items)
      .find((item) => item.id === activityId)!;
  };
  const pausesOf = async (activityId: string, attemptId: string): Promise<AttemptPauses> =>
    AttemptPausesSchema.parse(ok(await getAttemptPauses(teacherClient, schoolClass.id, activityId, attemptId)));
  const detail = async (client: ApiClient, activityId: string): Promise<StudentActivity> =>
    StudentActivitySchema.parse(ok(await client.get(`/api/me/activities/${activityId}`)));
  const attemptOf = (activityId: string, studentUserId: string) =>
    t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId }, include: { submission: true } });
  /** A student's exit of `minutes`, released by the teacher. */
  const exitFor = async (client: ApiClient, activityId: string, minutes: number, body: Record<string, unknown> = { reason: "WATER" }) => {
    const pause = ok<{ id: string }>(await declareExit(client, activityId, body), 201);
    clock.advance(minutes * MINUTE);
    ok(await releasePause(teacherClient, schoolClass.id, activityId, pause.id));
    return pause.id;
  };
  /** The class's room at the start of the lesson: `paused` and `steady` present and answering, `absent` never marked. */
  const lesson = async (options: CreateActivityOptions = {}) => {
    const created = await work(options);
    ok(await markPresent(teacherClient, schoolClass.id, created.activity.id, [paused.id, steady.id]));
    ok(await startAttempt(pausedClient, created.activity.id));
    ok(await startAttempt(steadyClient, created.activity.id));
    return created;
  };

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
    const created = await createClassWithStudents(t, teacher.id, { students: 3 });
    schoolClass = created.schoolClass;
    [absent, paused, steady] = created.students as [TestUser, TestUser, TestUser];
    pausedClient = await studentClient(paused);
    steadyClient = await studentClient(steady);
  });

  describe("016/FR-019 a lista de alunos da atividade", () => {
    it("016/US4-1 o aluno não marcado aparece como Ausente, fora de missed, e sem nota", async () => {
      const created = await lesson();
      const id = created.activity.id;
      expect(await rowOf(id, absent.id)).toMatchObject({ status: "ABSENT", markedAt: null, attemptId: null, grade: null, submittedAt: null });
      expect((await activityView(id)).counts.missed).toBe(0);

      // After the deadline (REJECT) and after the close, still ABSENT: never MISSED, never graded.
      clock.advance(8 * DAY);
      expect(await rowOf(id, absent.id)).toMatchObject({ status: "ABSENT", grade: null });
      expect(await rowOf(id, steady.id)).toMatchObject({ status: "MISSED" });
      expect((await activityView(id)).counts.missed).toBe(2);
      expect((await listed(id)).counts).toMatchObject({ missed: 2 });

      ok(await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${id}/close`, {}));
      expect(await rowOf(id, absent.id)).toMatchObject({ status: "ABSENT", grade: null });
      const [closed] = await t.prisma.auditEvent.findMany({ where: { type: "activity.closed" } });
      expect(closed!.metadata).toMatchObject({ missedCount: 2 });
      expect(await t.prisma.activitySubmission.count()).toBe(0);
    });

    it("016/US4-2 016/FR-019 cada linha traz o horário da presença, o número de pausas e o tempo fora", async () => {
      const markedAt = clock.now().toISOString();
      const created = await lesson();
      const id = created.activity.id;
      await exitFor(pausedClient, id, 4);
      clock.advance(10 * MINUTE);
      await exitFor(pausedClient, id, 3, { reason: "OTHER", note: NOTE });

      expect(await rowOf(id, paused.id)).toMatchObject({ markedAt, status: "IN_PROGRESS", pauses: { count: 2, secondsAway: 7 * 60, open: false } });
      expect(await rowOf(id, steady.id)).toMatchObject({ markedAt, pauses: { count: 0, secondsAway: 0, open: false } });
      expect(await rowOf(id, absent.id)).toMatchObject({ markedAt: null, pauses: { count: 0, secondsAway: 0, open: false } });

      // An open pause counts up to the server's now, and shows as open.
      ok(await declareExit(pausedClient, id, { reason: "BATHROOM" }), 201);
      clock.advance(2 * MINUTE);
      expect((await rowOf(id, paused.id)).pauses).toEqual({ count: 3, secondsAway: 9 * 60, open: true });
    });

    it("016/FR-019 um trabalho ALL_ENROLLED não tem Ausente nem presença", async () => {
      const { activity } = await createActivity(t, schoolClass, { publishAt: at(-DAY), deadline: at(7 * DAY) });
      for (const row of (await activityView(activity.id)).roster) {
        expect(row).toMatchObject({ status: "NOT_STARTED", markedAt: null, pauses: { count: 0, secondsAway: 0, open: false } });
      }
    });
  });

  describe("016/FR-021 as pausas na correção", () => {
    it("016/US4-2 016/FR-021 a entrega aberta mostra cada pausa com motivo, texto, saída, retorno, duração e quem iniciou", async () => {
      const created = await lesson();
      const id = created.activity.id;
      const first = clock.now();
      const water = await exitFor(pausedClient, id, 4);
      clock.advance(10 * MINUTE);
      const second = clock.now();
      const other = await exitFor(pausedClient, id, 3, { reason: "OTHER", note: NOTE });
      clock.advance(MINUTE);
      // A pause opened by the teacher (US5's route arrives later; the row is the same fact).
      const attempt = await attemptOf(id, paused.id);
      const third = clock.now();
      const byTeacher = await t.prisma.attemptPause.create({
        data: { attemptId: attempt.id, activityId: id, studentUserId: paused.id, initiatedBy: "TEACHER", reason: "TEACHER", startedAt: third, startedById: teacher.id },
      });
      clock.advance(2 * MINUTE);
      ok(await releasePause(teacherClient, schoolClass.id, id, byTeacher.id));
      ok(await submitAttempt(pausedClient, id, answers(created)));

      const ended = (from: Date, minutes: number) => new Date(from.getTime() + minutes * MINUTE).toISOString();
      expect(await pausesOf(id, attempt.id)).toEqual({
        items: [
          { id: water, studentUserId: paused.id, initiatedBy: "STUDENT", reason: "WATER", note: null, startedAt: first.toISOString(), endedAt: ended(first, 4), endedBy: "RELEASE", seconds: 240 },
          { id: other, studentUserId: paused.id, initiatedBy: "STUDENT", reason: "OTHER", note: NOTE, startedAt: second.toISOString(), endedAt: ended(second, 3), endedBy: "RELEASE", seconds: 180 },
          { id: byTeacher.id, studentUserId: paused.id, initiatedBy: "TEACHER", reason: "TEACHER", note: null, startedAt: third.toISOString(), endedAt: ended(third, 2), endedBy: "RELEASE", seconds: 120 },
        ],
        totalSecondsAway: 540,
      });
      expect(await rowOf(id, paused.id)).toMatchObject({ status: "SUBMITTED", pauses: { count: 3, secondsAway: 540, open: false } });

      // The student without pauses: an empty list.
      const steadyAttempt = await attemptOf(id, steady.id);
      expect(await pausesOf(id, steadyAttempt.id)).toEqual({ items: [], totalSecondsAway: 0 });
    });

    it("016/FR-021 uma pausa aberta numa atividade encerrada termina com a atividade (ACTIVITY_CLOSED)", async () => {
      const created = await lesson();
      const id = created.activity.id;
      const pause = ok<{ id: string }>(await declareExit(pausedClient, id, { reason: "PHONE" }), 201);
      clock.advance(5 * MINUTE);
      const closedAt = clock.now().toISOString();
      ok(await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${id}/close`, {}));
      clock.advance(HOUR);

      const attempt = await attemptOf(id, paused.id);
      expect((await pausesOf(id, attempt.id)).items).toEqual([expect.objectContaining({ id: pause.id, endedAt: closedAt, endedBy: "ACTIVITY_CLOSED", seconds: 300 })]);
      expect(await rowOf(id, paused.id)).toMatchObject({ status: "MISSED", pauses: { count: 1, secondsAway: 300, open: false } });
    });

    it("016/FR-021 a rota só vê tentativas da atividade e da turma do professor", async () => {
      const created = await lesson();
      const other = await lesson();
      const attempt = await attemptOf(created.activity.id, paused.id);
      expect((await getAttemptPauses(teacherClient, schoolClass.id, other.activity.id, attempt.id)).body).toEqual(NOT_FOUND);

      const outsider = await createUser(t, { roles: ["TEACHER"] });
      const outsiderClient = api(t, { cookie: await loginAs(t, outsider) });
      expect((await getAttemptPauses(outsiderClient, schoolClass.id, created.activity.id, attempt.id)).body).toEqual(NOT_FOUND);
      expect((await getAttemptPauses(pausedClient, schoolClass.id, created.activity.id, attempt.id)).status).toBe(403);
    });
  });

  describe("016/SC-008 presença e pausas nunca mudam nota nem entregam", () => {
    it("016/US4-3 016/SC-008 a nota dada pelo professor não muda com presença ou pausas, e nenhuma pausa entrega", async () => {
      const created = await lesson();
      const id = created.activity.id;
      await exitFor(pausedClient, id, 15);
      // A paused-and-released attempt stays IN_PROGRESS: nothing was submitted for the student.
      expect((await attemptOf(id, paused.id)).status).toBe("IN_PROGRESS");
      expect(await t.prisma.activitySubmission.count()).toBe(0);

      ok(await submitAttempt(pausedClient, id, answers(created)));
      ok(await submitAttempt(steadyClient, id, answers(created)));
      for (const student of [paused, steady]) {
        const attempt = await attemptOf(id, student.id);
        const before = TeacherAttemptSchema.parse(ok(await getAttempt(teacherClient, schoolClass.id, id, attempt.id)));
        expect(before.submission).toMatchObject({ grade: "0.50", gradePartial: true });
        const graded = TeacherAttemptSchema.parse(
          ok(
            await gradeAttempt(teacherClient, schoolClass.id, id, attempt.id, {
              version: before.submission!.version,
              decisions: [{ questionId: created.questionIds[1]!, grade: "0.40" }],
            }),
          ),
        );
        expect(graded.submission).toMatchObject({ grade: "0.90", gradePartial: false });
      }
      // The same answers and the same decisions: the same grade, with or without 15 minutes away.
      expect((await rowOf(id, paused.id)).grade).toBe("0.90");
      expect((await rowOf(id, steady.id)).grade).toBe("0.90");
      expect((await rowOf(id, absent.id)).grade).toBeNull();

      // No label of fraud anywhere the teacher reads attendance or pauses.
      const attempt = await attemptOf(id, paused.id);
      const bodies = JSON.stringify([await activityView(id), await pausesOf(id, attempt.id)]).toLowerCase();
      for (const word of ["fraud", "fraude", "cola", "viola", "suspeit", "cheat"]) expect(bodies).not.toContain(word);
    });
  });

  describe("016/FR-021 o histórico do aluno", () => {
    it("016/US4-4 o aluno vê as próprias pausas só depois da entrega, nunca a chamada nem outro aluno", async () => {
      const created = await lesson();
      const id = created.activity.id;
      const first = clock.now();
      const water = await exitFor(pausedClient, id, 4);
      clock.advance(MINUTE);
      const second = clock.now();
      const other = await exitFor(pausedClient, id, 2, { reason: "OTHER", note: NOTE });

      // Before the submission: no history.
      expect((await detail(pausedClient, id)).pauses).toEqual([]);

      ok(await submitAttempt(pausedClient, id, answers(created)));
      ok(await submitAttempt(steadyClient, id, answers(created)));
      const own = await detail(pausedClient, id);
      expect(own.pauses).toEqual([
        { id: water, initiatedBy: "STUDENT", reason: "WATER", note: null, startedAt: first.toISOString(), endedAt: new Date(first.getTime() + 4 * MINUTE).toISOString() },
        { id: other, initiatedBy: "STUDENT", reason: "OTHER", note: NOTE, startedAt: second.toISOString(), endedAt: new Date(second.getTime() + 2 * MINUTE).toISOString() },
      ]);

      // The other student sees none of them, and no one sees the class's attendance.
      const theirs = await detail(steadyClient, id);
      expect(theirs.pauses).toEqual([]);
      for (const body of [own, theirs]) {
        const text = JSON.stringify(body);
        expect(text).not.toContain(absent.id);
        expect(text).not.toContain("markedAt");
        expect(text).not.toContain("roster");
      }
      expect(JSON.stringify(theirs)).not.toContain(paused.id);
      expect(JSON.stringify(theirs)).not.toContain(water);

      // The list of the student's activities carries no pause.
      const list = ok<{ items: Record<string, unknown>[] }>(await pausedClient.get("/api/me/activities"));
      expect(JSON.stringify(list)).not.toContain(water);
    });

    it("016/FR-021 uma pausa encerrada pela aceitação do professor aparece no histórico com o horário da aceitação", async () => {
      const created = await lesson({ deadline: at(DAY), latePolicy: "REJECT" });
      const id = created.activity.id;
      ok(await saveAnswers(pausedClient, id, answers(created)));
      const pause = ok<{ id: string; startedAt: string }>(await declareExit(pausedClient, id, { reason: "BATHROOM" }), 201);
      clock.advance(2 * DAY);
      const attempt = await attemptOf(id, paused.id);
      ok(await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${id}/attempts/${attempt.id}/accept-submission`, {}));
      const acceptedAt = (await attemptOf(id, paused.id)).submission!.submittedAt.toISOString();

      expect((await detail(pausedClient, id)).pauses).toEqual([
        { id: pause.id, initiatedBy: "STUDENT", reason: "BATHROOM", note: null, startedAt: pause.startedAt, endedAt: acceptedAt },
      ]);
      expect((await pausesOf(id, attempt.id)).items).toEqual([expect.objectContaining({ endedAt: acceptedAt, endedBy: "ACCEPTED" })]);
    });
  });
});
