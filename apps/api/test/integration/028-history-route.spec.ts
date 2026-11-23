import type { StudentActivityPage, StudentHistoryPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow } from "../helpers/activities";
import { DAY, FixedClock, HOUR } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 028 Foundational — `GET /me/history` with no filter: every delivery of the student (no pending activity), each with
 * its delivery date and situation, newest delivery first, paged by the cursor with the same counts on every page;
 * `GET /me/activities` answers exactly as before (SC-005).
 */

const START = "2026-11-19T12:00:00.000Z";

describe("028 GET /me/history (sem filtros)", () => {
  let t: TestApp;
  let clock: FixedClock;
  let client: ReturnType<typeof api>;
  let teacher: TestUser;
  let student: TestUser;
  let schoolClass: SchoolClass;
  let work: WorkFixture;
  const ids = {} as Record<"unreleased" | "released" | "exam" | "exercise" | "pending", string>;
  const delivered = {} as Record<"unreleased" | "released" | "exam" | "exercise", Date>;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const assignment = (title: string, extra: { resultReleasedAt?: Date } = {}) =>
    createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      title,
      publishAt: at(-3 * DAY),
      deadline: at(2 * DAY),
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
      ...extra,
    });
  const history = async (query = "") => {
    const res = await client.get(`/api/me/history${query}`);
    expect(res.status).toBe(200);
    return res.body as StudentHistoryPage;
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
    student = await createUser(t, { roles: ["STUDENT"] });
    client = api(t, { cookie: await loginAs(t, student) });
    const poo = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus: poo });
    schoolClass = await createClass(t, teacher.id, { name: "ADS 3NA", subjectId: poo.subject.id });
    await createEnrollment(t, schoolClass.id, student.id);

    // Entregue, ainda sem liberação → aguardando.
    const unreleased = await assignment("Trabalho entregue");
    delivered.unreleased = at(-3 * HOUR);
    await createAttemptRow(t, unreleased.activity.id, student.id, {
      startedAt: at(-4 * HOUR),
      submission: { submittedAt: delivered.unreleased, gradeCents: 0, gradePartial: true },
    });
    // Liberado com correção completa → corrigida.
    const released = await assignment("Trabalho corrigido", { resultReleasedAt: at(-HOUR) });
    delivered.released = at(-2 * DAY);
    await createAttemptRow(t, released.activity.id, student.id, {
      startedAt: at(-2 * DAY - HOUR),
      submission: { submittedAt: delivered.released, gradeCents: 80 },
    });
    // Prova entregue, sem liberação → aguardando.
    const exam = await createActivity(t, schoolClass, { type: "EXAM", title: "Prova", publishAt: at(-2 * HOUR) });
    await t.prisma.activityAttendance.create({
      data: { activityId: exam.activity.id, studentUserId: student.id, classId: schoolClass.id, markedAt: at(-2 * HOUR), markedById: teacher.id },
    });
    delivered.exam = at(-HOUR);
    await createAttemptRow(t, exam.activity.id, student.id, {
      startedAt: at(-90 * 60_000),
      submission: { submittedAt: delivered.exam, endReason: "STUDENT_SUBMITTED" },
    });
    // Exercício concluído (tentativa 1, nada a corrigir) → corrigida; a data é a conclusão da tentativa 1.
    const exercise = await createActivity(t, schoolClass, { type: "EXERCISE", title: "Lista de exercícios", publishAt: at(-DAY) });
    delivered.exercise = at(-5 * HOUR);
    await createAttemptRow(t, exercise.activity.id, student.id, { startedAt: at(-6 * HOUR), completedAt: delivered.exercise });
    // Pendente: nunca entra no histórico.
    const pending = await assignment("Trabalho pendente");

    ids.unreleased = unreleased.activity.id;
    ids.released = released.activity.id;
    ids.exam = exam.activity.id;
    ids.exercise = exercise.activity.id;
    ids.pending = pending.activity.id;
  });

  it("028/FR-016 devolve as quatro entregas, sem a pendente, com deliveredAt e situação, da mais recente para a mais antiga", async () => {
    const body = await history();
    expect(body.items.map((item) => item.id)).toEqual([ids.exam, ids.unreleased, ids.exercise, ids.released]);
    expect(body.items.map((item) => item.id)).not.toContain(ids.pending);
    const byId = new Map(body.items.map((item) => [item.id, item]));
    expect(byId.get(ids.unreleased)).toMatchObject({ deliveredAt: delivered.unreleased.toISOString(), situation: "AWAITING", result: null });
    expect(byId.get(ids.released)).toMatchObject({ deliveredAt: delivered.released.toISOString(), situation: "GRADED" });
    expect(byId.get(ids.released)!.result).not.toBeNull();
    expect(byId.get(ids.exam)).toMatchObject({ deliveredAt: delivered.exam.toISOString(), situation: "AWAITING", result: null });
    expect(byId.get(ids.exercise)).toMatchObject({ deliveredAt: delivered.exercise.toISOString(), situation: "GRADED" });
  });

  it("028/FR-003 totais e contagens calculados pelo servidor", async () => {
    const body = await history();
    expect(body.totals).toEqual({ delivered: 4, awaiting: 2, graded: 2, missed: 0 });
    expect(body.tabCounts).toEqual({ all: 4, awaiting: 2, graded: 2, missed: 0 });
    expect(body.total).toBe(4);
    expect(body.nextCursor).toBeNull();
  });

  it("028/FR-008 com pageSize=1 e cursor, as quatro páginas trazem cada entrega uma vez e as mesmas contagens", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 4; page += 1) {
      const body: StudentHistoryPage = await history(`?pageSize=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      expect(body.items).toHaveLength(1);
      expect(body.totals).toEqual({ delivered: 4, awaiting: 2, graded: 2, missed: 0 });
      expect(body.tabCounts.all).toBe(4);
      expect(body.total).toBe(4);
      seen.push(body.items[0]!.id);
      cursor = body.nextCursor;
    }
    expect(cursor).toBeNull();
    expect(seen).toEqual([ids.exam, ids.unreleased, ids.exercise, ids.released]);
    expect((await client.get("/api/me/history?cursor=xyz")).status).toBe(400);
  });

  it("028/SC-005 028/FR-023 GET /me/activities mantém o formato da 012, sem as entregas (emenda 2026-11-23)", async () => {
    // Amended SC-005: the list keeps its shape (no field of the history), but deliveries now live only in the
    // "Histórico" (FR-023) and the "Entregues/concluídas" filter is gone.
    const res = await client.get("/api/me/activities");
    expect(res.status).toBe(200);
    const body = res.body as StudentActivityPage;
    expect(Object.keys(body).sort()).toEqual(["items", "nextCursor"]);
    const listed = body.items.map((item) => item.id);
    for (const id of [ids.unreleased, ids.released, ids.exam, ids.exercise]) expect(listed).not.toContain(id);
    for (const item of body.items) {
      expect(item).not.toHaveProperty("deliveredAt");
      expect(item).not.toHaveProperty("situation");
    }
    expect((await client.get("/api/me/activities?status=COMPLETED")).status).toBe(400);
  });

  it("028/FR-018 sem sessão → 401; sem atividades.proprias.visualizar → 403", async () => {
    expect((await api(t).get("/api/me/history")).status).toBe(401);
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    expect((await teacherClient.get("/api/me/history")).status).toBe(403);
  });
});
