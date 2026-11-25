import type { StudentHistoryItem, StudentHistoryPage, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { applyWork, closeByHand, createActivity, createAttemptRow, createClassWithStudents, releaseResult, submitAttempt } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, decideHold, holdByHand, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { startGroup } from "../helpers/group-work";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 029/US1 — the Histórico holds only the works and exams the teacher closed (029/FR-001–FR-004, FR-006): a closed
 * delivery is AWAITING or GRADED and counts in the cards, a closed work without a delivery is MISSED dated by the
 * close, and an active work or exam (delivered or not) and every exercise stay out of items and counts.
 *
 * The clock starts at the real time, as 018's suites: the exam triggers compare with the database clock.
 */

type Client = ReturnType<typeof api>;

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();
const ZERO = { all: 0, awaiting: 0, graded: 0, missed: 0, cancelled: 0 };

describe("029/US1 o Histórico só com o que o professor encerrou", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let schoolClass: SchoolClass;
  let syllabus: ConfirmedSyllabus;
  let work: WorkFixture;
  let student: TestUser;
  let classmate: TestUser;
  let client: Client;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const assignment = (title: string, extra: Parameters<typeof createActivity>[2] = {}) =>
    createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      title,
      publishAt: at(-3 * DAY),
      deadline: at(2 * DAY),
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
      ...extra,
    });
  const deliver = (activityId: string, submittedAt: Date, extra: Record<string, unknown> = {}) =>
    createAttemptRow(t, activityId, student.id, { startedAt: new Date(submittedAt.getTime() - HOUR), submission: { submittedAt, ...extra } });
  const historyOf = async (as: Client = client, query = "") => {
    const res = await as.get(`/api/me/history${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentHistoryPage;
  };
  const rowOf = async (activityId: string, as: Client = client): Promise<StudentHistoryItem | undefined> =>
    (await historyOf(as)).items.find((item) => item.id === activityId);
  const clientOf = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = await clientOf(teacher);
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus });
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    schoolClass = created.schoolClass;
    [student, classmate] = created.students as [TestUser, TestUser];
    client = await clientOf(student);
  });

  it("029/US1-1 encerrada com entrega: em Todas, em Aguardando ou Corrigidas, e nos cards", async () => {
    const awaiting = await assignment("Trabalho aguardando");
    await deliver(awaiting.activity.id, at(-3 * HOUR), { gradePartial: true });
    const graded = await assignment("Trabalho corrigido", { resultReleasedAt: at(-HOUR) });
    await deliver(graded.activity.id, at(-2 * DAY), { gradeCents: 80 });
    for (const id of [awaiting.activity.id, graded.activity.id]) await closeByHand(t, id, at(-30 * MINUTE));

    const body = await historyOf();
    expect(body.items.map((item) => [item.id, item.situation])).toEqual([
      [awaiting.activity.id, "AWAITING"],
      [graded.activity.id, "GRADED"],
    ]);
    expect(body.items[1]!.result).toMatchObject({ grade: "0.80" });
    expect(body.totals).toEqual({ delivered: 2, awaiting: 1, graded: 1, missed: 0, cancelled: 0 });
    expect(body.tabCounts).toEqual({ ...ZERO, all: 2, awaiting: 1, graded: 1 });
    expect((await historyOf(client, "?tab=AWAITING")).items.map((item) => item.id)).toEqual([awaiting.activity.id]);
    expect((await historyOf(client, "?tab=GRADED")).items.map((item) => item.id)).toEqual([graded.activity.id]);
  });

  it("029/US1-2 encerrada sem entrega: MISSED com endedAt = encerramento, fora dos cards", async () => {
    const missed = await assignment("Trabalho não entregue");
    const closedAt = at(-2 * HOUR);
    await closeByHand(t, missed.activity.id, closedAt);

    const body = await historyOf();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: missed.activity.id,
      situation: "MISSED",
      deliveredAt: null,
      endedAt: closedAt.toISOString(),
      result: null,
    });
    expect(body.totals).toEqual({ delivered: 0, awaiting: 0, graded: 0, missed: 1, cancelled: 0 });
    expect(body.tabCounts).toEqual({ ...ZERO, all: 1, missed: 1 });
    expect((await historyOf(client, "?tab=MISSED")).items.map((item) => item.id)).toEqual([missed.activity.id]);
  });

  it("029/US1-3 trabalho ou prova ativo, entregue ou não: fora dos itens e das contagens", async () => {
    const delivered = await assignment("Trabalho ativo entregue");
    await deliver(delivered.activity.id, at(-HOUR));
    await assignment("Trabalho ativo pendente");
    const exam = await approvedExam(t, teacherClient, syllabus);
    const applied = await applyExam(teacherClient, schoolClass.id, exam.id, { acknowledgeOutOfScope: true });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    const examId = (applied.body as TeacherActivity).id;
    expect((await startExam(client, examId)).status).toBe(200);
    clock.advance(MINUTE);
    expect((await submitAttempt(client, examId)).status).toBe(200);

    const body = await historyOf();
    expect(body.items).toEqual([]);
    expect(body.tabCounts).toEqual(ZERO);
    expect(body.totals).toEqual({ delivered: 0, awaiting: 0, graded: 0, missed: 0, cancelled: 0 });
  });

  it("029/US1-4 exercício concluído ou não, ativo ou encerrado: nunca no Histórico", async () => {
    const active = await createActivity(t, schoolClass, { type: "EXERCISE", title: "Lista ativa", publishAt: at(-DAY) });
    await createAttemptRow(t, active.activity.id, student.id, { startedAt: at(-6 * HOUR), completedAt: at(-5 * HOUR) });
    const closed = await createActivity(t, schoolClass, { type: "EXERCISE", title: "Lista encerrada", publishAt: at(-DAY) });
    await createAttemptRow(t, closed.activity.id, student.id, { startedAt: at(-4 * HOUR), completedAt: at(-3 * HOUR) });
    const untouched = await createActivity(t, schoolClass, { type: "EXERCISE", title: "Lista sem tentativa", publishAt: at(-DAY) });
    for (const id of [closed.activity.id, untouched.activity.id]) await closeByHand(t, id, at(-HOUR));

    const body = await historyOf();
    expect(body.items).toEqual([]);
    expect(body.tabCounts).toEqual(ZERO);
    expect(body.totals.missed).toBe(0);
  });

  it("029/US1-5 encerrar um trabalho ativo entregue o move para o Histórico na leitura seguinte", async () => {
    const created = await assignment("Trabalho que será encerrado");
    const submittedAt = at(-HOUR);
    await deliver(created.activity.id, submittedAt);
    expect(await rowOf(created.activity.id)).toBeUndefined();

    await closeByHand(t, created.activity.id, at(-MINUTE));
    expect(await rowOf(created.activity.id)).toMatchObject({ situation: "AWAITING", deliveredAt: submittedAt.toISOString(), endedAt: at(-MINUTE).toISOString() });
  });

  it("029/US1-6 Histórico vazio: tudo 0", async () => {
    await assignment("Trabalho ativo");
    expect(await historyOf()).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
      tabCounts: ZERO,
      totals: { delivered: 0, awaiting: 0, graded: 0, missed: 0, cancelled: 0 },
    });
  });

  it("029/FR-006 a data e a ordem são deliveredAt ?? endedAt, a mais recente primeiro", async () => {
    const old = await assignment("Entregue há 3 dias");
    await deliver(old.activity.id, at(-3 * DAY));
    const recent = await assignment("Entregue há 1 hora");
    await deliver(recent.activity.id, at(-HOUR));
    const missed = await assignment("Encerrado há 1 dia sem entrega");
    await closeByHand(t, old.activity.id, at(-30 * MINUTE));
    await closeByHand(t, recent.activity.id, at(-30 * MINUTE));
    await closeByHand(t, missed.activity.id, at(-DAY));

    const items = (await historyOf()).items;
    expect(items.map((item) => item.id)).toEqual([recent.activity.id, missed.activity.id, old.activity.id]);
    const missedRow = items[1]!;
    expect([missedRow.deliveredAt, missedRow.endedAt]).toEqual([null, at(-DAY).toISOString()]);
  });

  describe("casos de borda das provas", () => {
    const appliedExam = async () => {
      const exam = await approvedExam(t, teacherClient, syllabus);
      const res = await applyExam(teacherClient, schoolClass.id, exam.id, { acknowledgeOutOfScope: true });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return (res.body as TeacherActivity).id;
    };
    const holdOf = async (activityId: string) => {
      expect((await startExam(client, activityId)).status).toBe(200);
      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId: student.id } });
      return holdByHand(t, attempt, at(MINUTE));
    };

    it("029/FR-004 prova encerrada retida: AWAITING sem deliveredAt, conta em awaiting e delivered", async () => {
      const activityId = await appliedExam();
      await holdOf(activityId);
      clock.advance(2 * MINUTE);
      await closeByHand(t, activityId, clock.now());

      const body = await historyOf();
      expect(body.items.find((item) => item.id === activityId)).toMatchObject({
        situation: "AWAITING",
        deliveredAt: null,
        endedAt: clock.now().toISOString(),
        result: null,
      });
      expect(body.totals).toEqual({ delivered: 1, awaiting: 1, graded: 0, missed: 0, cancelled: 0 });
    });

    it("029/FR-002 prova encerrada zerada pela decisão do professor: entrega, nota só após a liberação", async () => {
      const activityId = await appliedExam();
      const hold = await holdOf(activityId);
      clock.advance(2 * MINUTE);
      const decided = await decideHold(teacherClient, schoolClass.id, activityId, hold.id, "cancel");
      expect(decided.status, JSON.stringify(decided.body)).toBe(200);
      await closeByHand(t, activityId, clock.now());

      expect(await rowOf(activityId)).toMatchObject({ situation: "AWAITING", result: null });
      expect((await releaseResult(teacherClient, schoolClass.id, activityId)).status).toBe(200);
      const released = await rowOf(activityId);
      expect(released).toMatchObject({ situation: "GRADED", result: { grade: "0.00" } });
      expect(released!.deliveredAt).not.toBeNull();
    });
  });

  it("029/FR-002 trabalho em grupo encerrado: uma linha por integrante, com a entrega do grupo", async () => {
    const applied = await applyWork(teacherClient, schoolClass.id, work.id, { groupSize: 2 });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    const activityId = (applied.body as TeacherActivity).id;
    expect((await startGroup(client, activityId, [classmate.id])).status).toBe(200);
    clock.advance(10 * MINUTE);
    expect((await submitAttempt(client, activityId)).status).toBe(200);
    const submittedAt = clock.now().toISOString();
    expect(await rowOf(activityId)).toBeUndefined();

    await closeByHand(t, activityId, at(MINUTE));
    for (const member of [client, await clientOf(classmate)]) {
      const body = await historyOf(member);
      expect(body.items.filter((item) => item.id === activityId)).toHaveLength(1);
      expect(body.items[0]).toMatchObject({ id: activityId, deliveredAt: submittedAt, situation: "AWAITING" });
    }
  });
});
