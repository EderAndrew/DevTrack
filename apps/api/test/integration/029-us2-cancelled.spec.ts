import type { StudentHistoryItem, StudentHistoryPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { cancelByHand, closeByHand, createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { markPresent } from "../helpers/attendance";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 029/US2 — a work or exam the teacher cancelled is shown only in the Histórico (029/FR-005, research HC2, HC3): in
 * "Todas" and the tab CANCELLED, with the delivery's date or the cancellation's, never a result or points (even when
 * released before), only if it was published and released to the student before the cancellation, and never in the
 * cards.
 */

type Client = ReturnType<typeof api>;

const START = "2026-11-24T12:00:00.000Z";
const FEEDBACK = "FEEDBACK-CANCELADA-029";

describe("029/US2 provas e trabalhos cancelados no Histórico", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let schoolClass: SchoolClass;
  let syllabus: ConfirmedSyllabus;
  let work: WorkFixture;
  let student: TestUser;
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
  const historyOf = async (query = "") => {
    const res = await client.get(`/api/me/history${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentHistoryPage;
  };
  const rowOf = async (activityId: string): Promise<StudentHistoryItem | undefined> =>
    (await historyOf()).items.find((item) => item.id === activityId);

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
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus });
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 1 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
    client = api(t, { cookie: await loginAs(t, student) });
  });

  it("029/US2-1 cancelado pelo professor depois de publicado: em Todas e na aba CANCELLED", async () => {
    const work1 = await assignment("Trabalho cancelado");
    const exam = await createActivity(t, schoolClass, { type: "EXAM", title: "Prova cancelada", publishAt: at(-DAY), deadline: at(2 * DAY) });
    // 032: presence is taken only inside the period, so the period is still open.
    expect((await markPresent(teacherClient, schoolClass.id, exam.activity.id, [student.id])).status).toBe(200);
    // The teacher's own route, as in the classroom.
    const cancelled = await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${work1.activity.id}/cancel`, {});
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    await cancelByHand(t, exam.activity.id, at(-2 * HOUR));

    const body = await historyOf();
    expect(body.items.map((item) => [item.id, item.situation]).sort()).toEqual(
      [
        [work1.activity.id, "CANCELLED"],
        [exam.activity.id, "CANCELLED"],
      ].sort(),
    );
    expect(body.tabCounts).toEqual({ all: 2, awaiting: 0, graded: 0, missed: 0, cancelled: 2 });
    expect((await historyOf("?tab=CANCELLED")).items.map((item) => item.id).sort()).toEqual([work1.activity.id, exam.activity.id].sort());
    expect((await historyOf("?tab=MISSED")).items).toEqual([]);
  });

  it("029/US2-2 cancelado com entrega e resultado liberado antes: data da entrega, sem resultado, pontos nem feedback", async () => {
    const graded = await assignment("Trabalho corrigido e cancelado", { resultReleasedAt: at(-2 * HOUR) });
    const submittedAt = at(-DAY);
    await deliver(graded.activity.id, submittedAt, { gradeCents: 90, generalFeedback: FEEDBACK });
    await cancelByHand(t, graded.activity.id, at(-HOUR));

    const row = await rowOf(graded.activity.id);
    expect(row).toMatchObject({
      situation: "CANCELLED",
      deliveredAt: submittedAt.toISOString(),
      endedAt: at(-HOUR).toISOString(),
      result: null,
      points: null,
      canAnswer: false,
      urgent: false,
    });
    expect(JSON.stringify(row)).not.toMatch(new RegExp(`"grade"|${FEEDBACK}|generalFeedback`));
  });

  it("029/US2-3 cancelado sem entrega: endedAt = cancelamento, sem entrega", async () => {
    const missed = await assignment("Trabalho cancelado sem entrega");
    const cancelledAt = at(-3 * HOUR);
    await cancelByHand(t, missed.activity.id, cancelledAt);

    expect(await rowOf(missed.activity.id)).toMatchObject({
      situation: "CANCELLED",
      deliveredAt: null,
      endedAt: cancelledAt.toISOString(),
      result: null,
    });
  });

  it("029/US2-4 encerrado e depois cancelado: passa de MISSED para CANCELLED, datado pelo cancelamento", async () => {
    const activity = await assignment("Trabalho encerrado depois cancelado");
    await closeByHand(t, activity.activity.id, at(-2 * HOUR));
    expect(await rowOf(activity.activity.id)).toMatchObject({ situation: "MISSED", endedAt: at(-2 * HOUR).toISOString() });

    await cancelByHand(t, activity.activity.id, at(-HOUR));
    expect(await rowOf(activity.activity.id)).toMatchObject({ situation: "CANCELLED", endedAt: at(-HOUR).toISOString() });
  });

  it("029/US2-5 cancelado antes da publicação ou nunca liberado ao aluno (sem presença): fora do Histórico", async () => {
    // Scheduled for later and cancelled before it was published.
    const scheduled = await assignment("Trabalho agendado", { publishAt: at(-HOUR), deadline: at(2 * DAY) });
    await cancelByHand(t, scheduled.activity.id, at(-2 * HOUR));
    // Published, but only for the students marked present — never this one.
    const gated = await assignment("Trabalho sem presença", { releaseMode: "PRESENT_ONLY" });
    await cancelByHand(t, gated.activity.id, at(-HOUR));
    // Never published at all (publishAt still in the future).
    const future = await assignment("Trabalho futuro", { publishAt: at(DAY), deadline: at(3 * DAY) });
    await cancelByHand(t, future.activity.id, at(-MINUTE));
    // An exercise cancelled stays out (it never enters the Histórico).
    const exercise = await createActivity(t, schoolClass, { type: "EXERCISE", title: "Lista cancelada", publishAt: at(-DAY) });
    await cancelByHand(t, exercise.activity.id, at(-HOUR));

    const body = await historyOf();
    expect(body.items).toEqual([]);
    expect(body.tabCounts.cancelled).toBe(0);

    // Once marked present before the cancellation, the gated one is the student's (016 unchanged).
    const marked = await assignment("Trabalho com presença", { releaseMode: "PRESENT_ONLY" });
    expect((await markPresent(teacherClient, schoolClass.id, marked.activity.id, [student.id])).status).toBe(200);
    await cancelByHand(t, marked.activity.id, at(-MINUTE));
    expect((await historyOf()).items.map((item) => item.id)).toEqual([marked.activity.id]);
  });

  it("029/US2-6 canceladas fora dos cards (entregues, aguardando, corrigidas)", async () => {
    const delivered = await assignment("Trabalho entregue cancelado", { resultReleasedAt: at(-2 * HOUR) });
    await deliver(delivered.activity.id, at(-DAY), { gradeCents: 100 });
    await cancelByHand(t, delivered.activity.id, at(-HOUR));
    const awaiting = await assignment("Trabalho aguardando cancelado");
    await deliver(awaiting.activity.id, at(-DAY), { gradePartial: true });
    await cancelByHand(t, awaiting.activity.id, at(-HOUR));

    const body = await historyOf();
    expect(body.totals).toEqual({ delivered: 0, awaiting: 0, graded: 0, missed: 0, cancelled: 2 });
    expect(body.tabCounts).toEqual({ all: 2, awaiting: 0, graded: 0, missed: 0, cancelled: 2 });
  });
});
