import type { StudentHistoryPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { loginAs, createUser, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 028/US2 — the tabs (028/FR-005–FR-007): `tab` narrows the list and `total` on the server, on every page, while
 * `tabCounts` and `totals` stay those of every delivery. AWAITING = a work or exam without a visible result and an
 * exercise with points awaiting the teacher; GRADED = a released work with complete grading and an exercise with
 * nothing pending.
 */

type Client = ReturnType<typeof api>;

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();

describe("028/US2 abas Todas, Aguardando e Corrigidas", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let work: WorkFixture;
  let student: TestUser;
  let classmate: TestUser;
  let client: Client;
  const awaitingIds: string[] = [];
  const gradedIds: string[] = [];

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
  /** Every page of one tab with `pageSize=1`, following the cursor. */
  const allPages = async (as: Client, tab?: "AWAITING" | "GRADED") => {
    const pages: StudentHistoryPage[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ pageSize: "1" });
      if (tab) params.set("tab", tab);
      if (cursor) params.set("cursor", cursor);
      const page: StudentHistoryPage = await historyOf(as, `?${params}`);
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor !== null && pages.length < 50);
    return pages;
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    awaitingIds.length = 0;
    gradedIds.length = 0;
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus });
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    schoolClass = created.schoolClass;
    [student, classmate] = created.students as [TestUser, TestUser];
    client = api(t, { cookie: await loginAs(t, student) });

    // AWAITING: trabalho entregue sem liberação.
    const unreleased = await assignment("Trabalho entregue");
    await createAttemptRow(t, unreleased.activity.id, student.id, {
      startedAt: at(-4 * HOUR),
      submission: { submittedAt: at(-3 * HOUR), gradeCents: 0, gradePartial: true },
    });
    awaitingIds.push(unreleased.activity.id);

    // AWAITING: prova entregue, sem resultado liberado.
    const exam = await createActivity(t, schoolClass, { type: "EXAM", title: "Prova entregue", publishAt: at(-DAY) });
    await t.prisma.activityAttendance.create({
      data: { activityId: exam.activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: at(-DAY), markedById: teacher.id },
    });
    await createAttemptRow(t, exam.activity.id, student.id, { startedAt: at(-8 * HOUR), submission: { submittedAt: at(-7 * HOUR), endReason: "STUDENT_SUBMITTED" } });
    awaitingIds.push(exam.activity.id);

    // AWAITING: exercício com uma questão aberta esperando o professor.
    const pendingExercise = await createActivity(t, schoolClass, {
      type: "EXERCISE",
      title: "Exercício aberto",
      publishAt: at(-DAY),
      questions: [{ type: "OPEN_ANSWER" }],
    });
    const { attemptId } = await createAttemptRow(t, pendingExercise.activity.id, student.id, {
      startedAt: at(-10 * HOUR),
      completedAt: at(-9 * HOUR),
    });
    const question = await t.prisma.classActivityQuestion.findUniqueOrThrow({ where: { id: pendingExercise.questionIds[0]! } });
    await t.prisma.exerciseQuestionResult.create({
      data: {
        attemptId,
        questionId: question.id,
        activityId: pendingExercise.activity.id,
        questionPoints: question.points!,
        classId: schoolClass.id,
        studentUserId: student.id,
        sourceExerciseId: question.sourceExerciseId!,
        scoring: true,
        result: "PENDING_TEACHER",
        points: 0,
        nature: null,
      },
    });
    awaitingIds.push(pendingExercise.activity.id);

    // GRADED: trabalho liberado com correção completa.
    const released = await assignment("Trabalho corrigido", { resultReleasedAt: at(-HOUR) });
    await createAttemptRow(t, released.activity.id, student.id, {
      startedAt: at(-2 * DAY - HOUR),
      submission: { submittedAt: at(-2 * DAY), gradeCents: 80 },
    });
    gradedIds.push(released.activity.id);

    // GRADED: exercício concluído sem nada esperando o professor.
    const exercise = await createActivity(t, schoolClass, { type: "EXERCISE", title: "Lista de exercícios", publishAt: at(-DAY) });
    await createAttemptRow(t, exercise.activity.id, student.id, { startedAt: at(-6 * HOUR), completedAt: at(-5 * HOUR) });
    gradedIds.push(exercise.activity.id);
  });

  const COUNTS = { all: 5, awaiting: 3, graded: 2 };
  const TOTALS = { delivered: 5, awaiting: 3, graded: 2 };

  it("028/US2-1 sem tab: as três contagens e o total igual a tabCounts.all", async () => {
    const body = await historyOf(client);
    expect(body.tabCounts).toEqual(COUNTS);
    expect(body.total).toBe(body.tabCounts.all);
    expect(body.items).toHaveLength(5);
  });

  it("028/US2-2 028/FR-007 tab=AWAITING: só as que esperam o professor, em todas as páginas, com os totais intactos", async () => {
    const pages = await allPages(client, "AWAITING");
    const items = pages.flatMap((page) => page.items);
    expect(items.every((item) => item.situation === "AWAITING")).toBe(true);
    expect(items.map((item) => item.id).sort()).toEqual([...awaitingIds].sort());
    for (const page of pages) {
      expect(page.total).toBe(page.tabCounts.awaiting);
      expect(page.tabCounts).toEqual(COUNTS);
      expect(page.totals).toEqual(TOTALS);
    }
  });

  it("028/US2-3 tab=GRADED: só as com resultado disponível, em todas as páginas", async () => {
    const pages = await allPages(client, "GRADED");
    const items = pages.flatMap((page) => page.items);
    expect(items.every((item) => item.situation === "GRADED")).toBe(true);
    expect(items.map((item) => item.id).sort()).toEqual([...gradedIds].sort());
    for (const page of pages) {
      expect(page.total).toBe(2);
      expect(page.totals).toEqual(TOTALS);
    }
  });

  it("028/US2-4 aba vazia: items vazio, total 0 e as contagens das outras intactas", async () => {
    const unreleased = await assignment("Trabalho do colega");
    await createAttemptRow(t, unreleased.activity.id, classmate.id, {
      startedAt: at(-2 * HOUR),
      submission: { submittedAt: at(-HOUR) },
    });
    const body = await historyOf(api(t, { cookie: await loginAs(t, classmate) }), "?tab=GRADED");
    expect(body).toMatchObject({ items: [], nextCursor: null, total: 0, tabCounts: { all: 1, awaiting: 1, graded: 0 } });
  });

  it("028/US2 tab desconhecida → 400", async () => {
    const res = await client.get("/api/me/history?tab=OUTRA");
    expect(res.status).toBe(400);
  });
});
