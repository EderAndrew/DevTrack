import { randomUUID } from "node:crypto";
import type { StudentActivity, StudentActivityPage, StudentActivitySummary, StudentDashboard } from "@repo/contracts";
import { StudentActivitySchema, StudentActivitySummarySchema, StudentDashboardSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type CreateActivityOptions, createActivity, createAttemptRow, type SubmissionRowOptions } from "../helpers/activities";
import { DAY, FixedClock, HOUR } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 012/US2 — the student's dashboard and "Minhas atividades": only published, not cancelled
 * activities of classes with an ACTIVE enrollment (012/FR-007, FR-008), the situation derived by the
 * server clock on every read, counts, the next five by deadline, the overdue ones that still accept a
 * submission, urgency at 48 h, filters, cursor, and a 404 (with `student_access.denied`) for an
 * existing activity outside the student's context. Attempts and submissions are written straight to
 * the database: their routes arrive with US3 and US4.
 */

const START = "2026-10-01T12:00:00.000Z";

describe("012/US2 aluno vê o dashboard e \"Minhas atividades\"", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let client: ReturnType<typeof api>;
  let classA: SchoolClass;
  let classB: SchoolClass;
  let work: WorkFixture;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /**
   * An activity of `schoolClass` published a day ago (or a day before its deadline), due `dueIn` from
   * now: an ASSIGNMENT of `work` by default; an EXERCISE has no deadline (013), only the publication.
   */
  const activity = (schoolClass: SchoolClass, dueIn: number, options: CreateActivityOptions = {}) =>
    createActivity(t, schoolClass, {
      publishAt: at(Math.min(-DAY, dueIn - DAY)),
      deadline: at(dueIn),
      ...(options.type === "EXERCISE" ? {} : { sourceWorkId: work.id, sourceSubjectId: work.subjectId }),
      ...options,
    }).then((created) => created.activity);
  const inProgress = (activityId: string, who = student) => createAttemptRow(t, activityId, who.id, { startedAt: at(-HOUR) });
  const submitted = (activityId: string, submission: SubmissionRowOptions = {}) =>
    createAttemptRow(t, activityId, student.id, { startedAt: at(-2 * HOUR), submission: { submittedAt: at(-HOUR), ...submission } });
  const released = () => ({ resultReleasedAt: at(-HOUR) });

  const dashboard = async () => {
    const res = await client.get("/api/me/dashboard");
    expect(res.status).toBe(200);
    return StudentDashboardSchema.parse(res.body) satisfies StudentDashboard;
  };
  const list = async (query = "") => {
    const res = await client.get(`/api/me/activities${query}`);
    expect(res.status).toBe(200);
    return res.body as StudentActivityPage;
  };
  const deniedEvents = () => t.prisma.auditEvent.findMany({ where: { type: "student_access.denied" }, orderBy: { id: "asc" } });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Ana Professora" });
    student = await createUser(t, { roles: ["STUDENT"], name: "Bruna Souza Lima" });
    client = api(t, { cookie: await loginAs(t, student) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus });
    classA = await createClass(t, teacher.id, { name: "POO 2026.2", subjectId: syllabus.subject.id });
    classB = await createClass(t, teacher.id, { name: "Lógica — manhã" });
    await createEnrollment(t, classA.id, student.id);
    await createEnrollment(t, classB.id, student.id);
  });

  it("012/US2-1 012/FR-010 contadores 3/2/1/8 (concluídas = entregues + corrigidas) e as próximas por prazo", async () => {
    // 3 pending, 2 in progress, 1 overdue (still accepting), 5 submitted + 3 graded.
    const pending = [await activity(classA, 3 * DAY), await activity(classB, DAY), await activity(classA, 6 * DAY)];
    const progressing = [await activity(classB, 2 * DAY), await activity(classA, 5 * DAY)];
    for (const { id } of progressing) await inProgress(id);
    const overdue = await activity(classA, -HOUR, { latePolicy: "ACCEPT_MARKED" });
    for (let index = 0; index < 5; index += 1) await submitted((await activity(classB, (index + 1) * DAY)).id);
    for (let index = 0; index < 3; index += 1) {
      await submitted((await activity(classA, -(index + 2) * DAY, { ...released() })).id, { gradeCents: 80 });
    }

    const body = await dashboard();
    expect(body.firstName).toBe("Bruna");
    expect(body.counts).toEqual({ pending: 3, inProgress: 2, overdue: 1, completed: 8 });
    expect(body.serverNow).toBe(START);
    // The next ones: PENDING and IN_PROGRESS only, nearest deadline first.
    expect(body.next.map((item) => item.id)).toEqual(
      [pending[1]!, progressing[0]!, pending[0]!, progressing[1]!, pending[2]!].map((item) => item.id),
    );
    expect(body.next.map((item) => item.status)).toEqual(["PENDING", "IN_PROGRESS", "PENDING", "IN_PROGRESS", "PENDING"]);
    expect(body.overdueOpen.map((item) => [item.id, item.status, item.canAnswer, item.urgent])).toEqual([[overdue.id, "OVERDUE", true, true]]);
  });

  it("012/FR-010 no máximo 5 próximas; atrasada que não aceita entrega fica de fora das abertas e sem urgência", async () => {
    for (let index = 0; index < 7; index += 1) await activity(classA, (index + 1) * DAY);
    const rejected = await activity(classB, -HOUR, { latePolicy: "REJECT" });
    const closed = await activity(classB, DAY, { status: "CLOSED" });

    const body = await dashboard();
    expect(body.next).toHaveLength(5);
    expect(body.counts).toEqual({ pending: 7, inProgress: 0, overdue: 2, completed: 0 });
    expect(body.overdueOpen).toEqual([]);
    const all = (await list()).items;
    expect(all.filter((item) => [rejected.id, closed.id].includes(item.id)).map((item) => [item.status, item.canAnswer, item.urgent])).toEqual([
      ["OVERDUE", false, false],
      ["OVERDUE", false, false],
    ]);
  });

  it("012/US2-2 012/FR-011 urgente com 47 h até o prazo, não com 49 h; entregue nunca é urgente", async () => {
    const soon = await activity(classA, 47 * HOUR);
    const later = await activity(classA, 49 * HOUR);
    const done = await activity(classA, 10 * HOUR);
    await submitted(done.id);

    const items = (await list()).items;
    const urgentOf = (id: string) => items.find((item) => item.id === id)!.urgent;
    expect(urgentOf(soon.id)).toBe(true);
    expect(urgentOf(later.id)).toBe(false);
    expect(urgentOf(done.id)).toBe(false);
    // The clock moves: 49 h becomes 47 h without anything stored.
    clock.advance(2 * HOUR);
    expect((await list()).items.find((item) => item.id === later.id)!.urgent).toBe(true);
  });

  it("012/US2-3 012/FR-007 sem matrícula, matrícula REMOVED, agendada e cancelada não aparecem", async () => {
    const visible = await activity(classA, DAY);
    const other = await createClass(t, teacher.id, { name: "Turma alheia" });
    await activity(other, DAY);
    const left = await createClass(t, teacher.id, { name: "Turma de onde saiu" });
    const enrollment = await createEnrollment(t, left.id, student.id);
    await activity(left, DAY);
    await t.prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: "REMOVED", removedAt: at(-HOUR), removedById: teacher.id } });
    await createActivity(t, classA, { publishAt: at(HOUR), deadline: at(2 * DAY) });
    await activity(classA, DAY, { status: "CANCELLED" });

    const body = await dashboard();
    expect(body.counts).toEqual({ pending: 1, inProgress: 0, overdue: 0, completed: 0 });
    expect(body.next.map((item) => item.id)).toEqual([visible.id]);
    expect((await list()).items.map((item) => item.id)).toEqual([visible.id]);
    // The scheduled one appears when the server clock reaches its publication.
    clock.advance(HOUR);
    expect((await list()).items).toHaveLength(2);
  });

  it("012/US2-4 012/FR-012 filtra por \"Atrasadas\" e \"Trabalho\"; cada item traz os campos do contrato", async () => {
    const lateAssignment = await activity(classA, -HOUR, { type: "ASSIGNMENT", title: "Trabalho atrasado", instructions: "  Entregar\n o diagrama   de classes. " });
    await activity(classA, -HOUR, { type: "EXERCISE" });
    await activity(classA, DAY, { type: "ASSIGNMENT" });

    const page = await list("?status=OVERDUE&type=ASSIGNMENT");
    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(1);
    const item = StudentActivitySummarySchema.parse(page.items[0]) satisfies StudentActivitySummary;
    expect(item).toEqual({
      id: lateAssignment.id,
      type: "ASSIGNMENT",
      // 015: the mode and the AI help, NORMAL and none as in 012.
      executionMode: "NORMAL",
      aiHelp: { allowance: 0 },
      title: "Trabalho atrasado",
      summary: "Entregar o diagrama de classes.",
      class: { id: classA.id, name: "POO 2026.2" },
      subjectName: expect.any(String),
      teacherName: "Ana Professora",
      publishedAt: at(-HOUR - DAY).toISOString(),
      deadline: at(-HOUR).toISOString(),
      latePolicy: "REJECT",
      status: "OVERDUE",
      late: false,
      canAnswer: false,
      urgent: false,
      submittedAt: null,
      totalGrade: "1.00",
      result: null,
      points: null,
    });
    // A class without subject.
    const exercise = (await list("?type=EXERCISE")).items.find((entry) => entry.class.id === classA.id)!;
    expect(exercise.subjectName).toBe(item.subjectName);
    const inB = await activity(classB, DAY);
    expect((await list()).items.find((entry) => entry.id === inB.id)!.subjectName).toBeNull();
  });

  it("012/US2-4 012/FR-012 \"Entregues/concluídas\" junta entregues e corrigidas; nota e feedback só depois da liberação", async () => {
    const waiting = await activity(classA, DAY);
    await submitted(waiting.id, { gradeCents: 70, generalFeedback: "Bom trabalho." });
    const partial = await activity(classA, -DAY, released());
    await submitted(partial.id, { gradeCents: 30, gradePartial: true });
    const graded = await activity(classA, -2 * DAY, released());
    await submitted(graded.id, { gradeCents: 90, generalFeedback: "Muito bem." });
    const lateOne = await activity(classB, -3 * DAY, { ...released(), latePolicy: "ACCEPT_MARKED" });
    await submitted(lateOne.id, { gradeCents: 50, late: true });
    await activity(classA, 2 * DAY);

    const items = (await list("?status=COMPLETED")).items;
    expect(items.map((item) => [item.id, item.status, item.late, item.result])).toEqual([
      [lateOne.id, "GRADED", true, { grade: "0.50", hasFeedback: false }],
      [graded.id, "GRADED", false, { grade: "0.90", hasFeedback: true }],
      [partial.id, "SUBMITTED", false, null],
      [waiting.id, "SUBMITTED", false, null],
    ]);
    expect(items.every((item) => item.submittedAt === at(-HOUR).toISOString())).toBe(true);
    // Never a grade in the body before the release.
    const res = await client.get(`/api/me/activities/${waiting.id}`);
    expect(JSON.stringify(res.body)).not.toMatch(/0\.70|Bom trabalho/);
  });

  it("012/FR-012 ordem por prazo e id, cursor e limite: as páginas somam a lista inteira", async () => {
    const created: string[] = [];
    for (let index = 0; index < 7; index += 1) created.push((await activity(index % 2 ? classA : classB, (index + 1) * HOUR)).id);
    // Same deadline: id breaks the tie.
    const tieA = await activity(classA, 30 * HOUR);
    const tieB = await activity(classB, 30 * HOUR);

    const pages: StudentActivitySummary[][] = [];
    let cursor: string | null = null;
    do {
      const page: StudentActivityPage = await list(`?pageSize=4${cursor ? `&cursor=${cursor}` : ""}`);
      pages.push(page.items);
      cursor = page.nextCursor;
    } while (cursor);
    expect(pages.map((page) => page.length)).toEqual([4, 4, 1]);
    expect(pages.flat().map((item) => item.id)).toEqual([...created, ...[tieA.id, tieB.id].sort()]);
    expect((await list()).items).toHaveLength(9);

    expect((await client.get("/api/me/activities?pageSize=51")).status).toBe(400);
    expect((await client.get("/api/me/activities?cursor=nao-e-cursor")).status).toBe(400);
    expect((await client.get("/api/me/activities?status=SUBMITTED")).status).toBe(400);
    expect((await client.get("/api/me/activities?type=EXAM")).status).toBe(400);
  });

  it("012/US2-5 aluno sem atividades: dashboard e lista vazios", async () => {
    const { rankings, ...body } = await dashboard();
    expect(body).toEqual({
      firstName: "Bruna",
      counts: { pending: 0, inProgress: 0, overdue: 0, completed: 0 },
      next: [],
      overdueOpen: [],
      serverNow: START,
    });
    // 013/FR-021: the class ranking is there even without activities, everyone at 0.
    expect(rankings.flatMap((entry) => entry.top).every((row) => row.points === 0)).toBe(true);
    expect(await list()).toEqual({ items: [], nextCursor: null });
  });

  it("012/US2-6 conta STUDENT + TEACHER vê só as atividades em que é aluna", async () => {
    const both = await createUser(t, { roles: ["STUDENT", "TEACHER"], name: "Carla Dupla" });
    const ownClass = await createClass(t, both.id, { name: "Turma da Carla" });
    await createEnrollment(t, (await createClass(t, both.id)).id, (await createUser(t)).id);
    await activity(ownClass, DAY);
    await createEnrollment(t, classA.id, both.id);
    const asStudent = await activity(classA, DAY);
    const dual = api(t, { cookie: await loginAs(t, both) });

    const res = await dual.get("/api/me/activities");
    expect(res.status).toBe(200);
    expect((res.body as StudentActivityPage).items.map((item) => item.id)).toEqual([asStudent.id]);
    const board = (await dual.get("/api/me/dashboard")).body as StudentDashboard;
    expect(board.counts.pending).toBe(1);
  });

  it("012/FR-008 012/FR-009 GET /me/activities/:id da própria turma: visão do aluno, sem gabarito nem dados de outro aluno", async () => {
    const created = await createActivity(t, classA, {
      publishAt: at(-DAY),
      deadline: at(DAY),
      instructions: "Leia o enunciado.",
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 50, alternatives: ["certa", "errada 1", "errada 2"], explanation: "porque sim" },
        { type: "CODE", valueCents: 50, starterCode: "class A {}", testCases: [
          { input: "1", expectedOutput: "1", visibility: "PUBLIC" },
          { input: "segredo", expectedOutput: "oculto", visibility: "PRIVATE" },
        ] },
      ],
    });
    const classmate = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, classA.id, classmate.id);
    await inProgress(created.activity.id, classmate);

    const res = await client.get(`/api/me/activities/${created.activity.id}`);
    expect(res.status).toBe(200);
    const view = StudentActivitySchema.parse(res.body) satisfies StudentActivity;
    expect(view).toMatchObject({
      id: created.activity.id,
      status: "PENDING",
      instructions: "Leia o enunciado.",
      serverNow: START,
      attempt: null,
      submission: null,
      result: null,
    });
    expect(view.questions.map((question) => [question.position, question.type, question.value])).toEqual([
      [0, "MULTIPLE_CHOICE", "0.50"],
      [1, "CODE", "0.50"],
    ]);
    expect(view.questions[0]!.alternatives.map((alternative) => alternative.text)).toEqual(["certa", "errada 1", "errada 2"]);
    expect(view.questions[1]!.publicTestCases).toEqual([{ input: "1", expectedOutput: "1" }]);
    expect(JSON.stringify(res.body)).not.toMatch(/isCorrect|porque sim|segredo|oculto|expectedSolution|gradingStrategy/);
  });

  it("012/FR-008 fora do contexto do aluno: o mesmo 404 e student_access.denied com o motivo; id inexistente sem evento", async () => {
    const other = await createClass(t, teacher.id);
    const notEnrolled = await activity(other, DAY);
    const left = await createClass(t, teacher.id);
    const enrollment = await createEnrollment(t, left.id, student.id);
    const removed = await activity(left, DAY);
    await t.prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: "REMOVED", removedAt: at(-HOUR), removedById: teacher.id } });
    const scheduled = (await createActivity(t, classA, { publishAt: at(HOUR), deadline: at(DAY) })).activity;
    const cancelled = await activity(classA, DAY, { status: "CANCELLED" });

    const bodies: unknown[] = [];
    for (const id of [notEnrolled.id, removed.id, scheduled.id, cancelled.id, randomUUID()]) {
      const res = await client.get(`/api/me/activities/${id}`);
      expect(res.status).toBe(404);
      bodies.push(res.body);
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(bodies[0]).toMatchObject({ statusCode: 404, code: "NOT_FOUND" });

    const events = await deniedEvents();
    expect(events.map((event) => [event.targetType, event.targetId, event.actorUserId, event.metadata])).toEqual([
      ["CLASS_ACTIVITY", notEnrolled.id, student.id, { route: "/me/activities/:activityId", reason: "NOT_ENROLLED" }],
      ["CLASS_ACTIVITY", removed.id, student.id, { route: "/me/activities/:activityId", reason: "NOT_ENROLLED" }],
      ["CLASS_ACTIVITY", scheduled.id, student.id, { route: "/me/activities/:activityId", reason: "NOT_PUBLISHED" }],
      ["CLASS_ACTIVITY", cancelled.id, student.id, { route: "/me/activities/:activityId", reason: "CANCELLED" }],
    ]);
    expect(events.every((event) => event.requestId !== null)).toBe(true);
  });

  it("012/FR-008 sem atividades.proprias.visualizar → 403 (professor), mesmo com o id certo", async () => {
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const own = await activity(classA, DAY);
    for (const path of ["/api/me/dashboard", "/api/me/activities", `/api/me/activities/${own.id}`]) {
      expect((await teacherClient.get(path)).status).toBe(403);
    }
  });
});
