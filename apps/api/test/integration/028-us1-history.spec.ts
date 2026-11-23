import type { StudentHistoryPage, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { applyWork, createActivity, createAttemptRow, createClassWithStudents, submitAttempt } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, decideHold, holdByHand, startExam } from "../helpers/exams";
import { loginAs, createUser, type TestUser } from "../helpers/factories";
import { startGroup } from "../helpers/group-work";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 028/US1 — the totals and the redesigned list (028/FR-001–FR-004, FR-008, FR-016): the totals count every delivery
 * whatever the page, the list is the newest delivery first and pages without repeating or skipping, a delivery shows
 * its result only once released with complete grading, an exercise shows its points. Edge cases: a group work is a
 * delivery of every member, an exam ended by the time is a delivery, a held exam is not until the teacher cancels it.
 *
 * The clock starts at the real time, as 018's suites: the exam triggers compare with the database clock.
 */

type Client = ReturnType<typeof api>;

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();

describe("028/US1 totais e lista redesenhada", () => {
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
  const ids = {} as Record<"unreleased" | "released" | "exercise", string>;

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
  const historyOf = async (as: Client, query = "") => {
    const res = await as.get(`/api/me/history${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentHistoryPage;
  };
  /** Every page with `pageSize`, following the cursor. */
  const allPages = async (as: Client, pageSize?: number) => {
    const pages: StudentHistoryPage[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams();
      if (pageSize !== undefined) params.set("pageSize", String(pageSize));
      if (cursor) params.set("cursor", cursor);
      const page: StudentHistoryPage = await historyOf(as, params.size > 0 ? `?${params}` : "");
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor !== null && pages.length < 50);
    return pages;
  };
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

    // Entregue há 3 h, sem liberação.
    const unreleased = await assignment("Trabalho entregue");
    await createAttemptRow(t, unreleased.activity.id, student.id, {
      startedAt: at(-4 * HOUR),
      submission: { submittedAt: at(-3 * HOUR), gradeCents: 0, gradePartial: true },
    });
    // Entregue há 2 dias, liberado com correção completa: 1,80 de 3,00 com feedback.
    const released = await assignment("Trabalho corrigido", {
      resultReleasedAt: at(-HOUR),
      questions: [{ type: "MULTIPLE_CHOICE" }, { type: "MULTIPLE_CHOICE" }, { type: "MULTIPLE_CHOICE" }],
    });
    await createAttemptRow(t, released.activity.id, student.id, {
      startedAt: at(-2 * DAY - HOUR),
      submission: { submittedAt: at(-2 * DAY), gradeCents: 180, generalFeedback: "Bom trabalho." },
    });
    // Exercício concluído há 5 h.
    const exercise = await createActivity(t, schoolClass, { type: "EXERCISE", title: "Lista de exercícios", publishAt: at(-DAY) });
    await createAttemptRow(t, exercise.activity.id, student.id, { startedAt: at(-6 * HOUR), completedAt: at(-5 * HOUR) });

    ids.unreleased = unreleased.activity.id;
    ids.released = released.activity.id;
    ids.exercise = exercise.activity.id;
  });

  it("028/US1-1 os totais contam todas as entregas, mesmo com pageSize=1", async () => {
    const body = await historyOf(client, "?pageSize=1");
    expect(body.items).toHaveLength(1);
    expect(body.totals).toEqual({ delivered: 3, awaiting: 1, graded: 2, missed: 0 });
  });

  it("028/US1-2 028/SC-001 a ordem é pela data da entrega, a mais recente primeiro, e o total bate com a soma das páginas", async () => {
    const pages = await allPages(client, 2);
    const items = pages.flatMap((page) => page.items);
    expect(items.map((item) => item.id)).toEqual([ids.unreleased, ids.exercise, ids.released]);
    const times = items.map((item) => Date.parse(item.deliveredAt!));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    for (const page of pages) expect(page.total).toBe(items.length);
  });

  it("028/US1-3 entrega não liberada: AWAITING e sem resultado", async () => {
    const item = (await historyOf(client)).items.find((entry) => entry.id === ids.unreleased)!;
    expect(item).toMatchObject({ situation: "AWAITING", result: null, status: "SUBMITTED" });
  });

  it("028/US1-4 liberada com correção completa: GRADED com a nota, a nota total e o feedback", async () => {
    const item = (await historyOf(client)).items.find((entry) => entry.id === ids.released)!;
    expect(item).toMatchObject({ situation: "GRADED", totalGrade: "3.00", result: { grade: "1.80", hasFeedback: true } });
  });

  it("028/US1-5 exercício concluído: COMPLETED com os pontos, nunca uma nota", async () => {
    const item = (await historyOf(client)).items.find((entry) => entry.id === ids.exercise)!;
    expect(item).toMatchObject({ type: "EXERCISE", status: "COMPLETED", situation: "GRADED", result: null, totalGrade: null });
    expect(item.points).not.toBeNull();
  });

  it("028/US1-8 aluno sem entregas: lista vazia e todos os totais 0", async () => {
    expect(await historyOf(await clientOf(classmate))).toEqual({
      items: [],
      nextCursor: null,
      total: 0,
      tabCounts: { all: 0, awaiting: 0, graded: 0, missed: 0 },
      totals: { delivered: 0, awaiting: 0, graded: 0, missed: 0 },
    });
  });

  it("028/US1-9 25 entregas com o pageSize padrão: duas páginas, sem repetir nem pular", async () => {
    const delivered: string[] = [];
    for (let index = 0; index < 25; index += 1) {
      const created = await assignment(`Trabalho ${index + 1}`);
      await createAttemptRow(t, created.activity.id, classmate.id, {
        startedAt: at(-(index + 2) * HOUR),
        submission: { submittedAt: at(-(index + 1) * HOUR) },
      });
      delivered.push(created.activity.id);
    }
    const pages = await allPages(await clientOf(classmate));
    expect(pages.map((page) => page.items.length)).toEqual([20, 5]);
    expect(pages.flatMap((page) => page.items.map((item) => item.id))).toEqual(delivered);
    for (const page of pages) expect([page.total, page.totals.delivered]).toEqual([25, 25]);
  });

  it("028/US1 trabalho em grupo: a entrega do líder aparece no histórico de cada integrante", async () => {
    const applied = await applyWork(teacherClient, schoolClass.id, work.id, { groupSize: 2 });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    const activityId = (applied.body as TeacherActivity).id;
    expect((await startGroup(client, activityId, [classmate.id])).status).toBe(200);
    clock.advance(10 * MINUTE);
    const submitted = await submitAttempt(client, activityId);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);

    for (const member of [client, await clientOf(classmate)]) {
      const item = (await historyOf(member)).items.find((entry) => entry.id === activityId);
      expect(item).toMatchObject({ deliveredAt: clock.now().toISOString(), situation: "AWAITING" });
    }
  });

  it("028/US1 prova encerrada pelo tempo conta como entrega; prova retida só aparece depois de cancelada", async () => {
    const exam = await approvedExam(t, teacherClient, syllabus);
    const apply = async () => {
      const res = await applyExam(teacherClient, schoolClass.id, exam.id, { acknowledgeOutOfScope: true });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return (res.body as TeacherActivity).id;
    };
    const timed = await apply();
    const heldId = await apply();
    expect((await startExam(client, timed)).status).toBe(200);
    expect((await startExam(client, heldId)).status).toBe(200);
    const startedAt = clock.now();
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: heldId, studentUserId: student.id } });
    const hold = await holdByHand(t, attempt, at(MINUTE));

    clock.advance(2 * MINUTE);
    expect((await historyOf(client)).items.map((item) => item.id)).not.toContain(heldId);

    // O tempo (60 min) acaba: a próxima leitura encerra a prova por tempo; a retida continua fora.
    clock.advance(HOUR);
    const afterTime = await historyOf(client);
    expect(afterTime.items.find((item) => item.id === timed)).toMatchObject({
      deliveredAt: new Date(startedAt.getTime() + HOUR).toISOString(),
      situation: "AWAITING",
      result: null,
    });
    expect(afterTime.items.map((item) => item.id)).not.toContain(heldId);

    const cancelled = await decideHold(teacherClient, schoolClass.id, heldId, hold.id, "cancel");
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    const afterCancel = await historyOf(client);
    expect(afterCancel.items.find((item) => item.id === heldId)).toMatchObject({ situation: "AWAITING", result: null });
    expect(afterCancel.totals).toEqual({ delivered: 5, awaiting: 3, graded: 2, missed: 0 });
  });
});
