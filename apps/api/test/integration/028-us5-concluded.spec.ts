import type { StudentActivityPage, StudentDashboard, StudentHistoryPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { acceptSubmission, createActivity, createAttemptRow } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { holdByHand } from "../helpers/exams";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 028/US5 (amendment 2026-11-23, FR-022–FR-025, research HI11–HI13): "Minhas atividades" and the Painel hold only what
 * the student can still do; deliveries and the activities the student can no longer deliver ("não entregues") are
 * only in the "Histórico". One student with an activity in each situation, in a turma with an active disciplina (A)
 * and an archived one (B).
 */

type Client = ReturnType<typeof api>;

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();

describe("028/US5 concluídas só no Histórico", () => {
  let t: TestApp;
  let clock: FixedClock;
  let classA: SchoolClass;
  let classB: SchoolClass;
  let workA: WorkFixture;
  let workB: WorkFixture;
  let teacherA: TestUser;
  let student: TestUser;
  let client: Client;
  let ids: Record<
    | "pendente"
    | "emAndamento"
    | "atrasadaAceita"
    | "atrasadaRejeitada"
    | "entregue"
    | "corrigida"
    | "exercicio"
    | "encerrada"
    | "arquivada"
    | "provaRetida",
    string
  >;
  let rejectedAttemptId: string;
  let archivedAt: Date;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const work = (schoolClass: SchoolClass, fixture: WorkFixture, title: string, extra: Parameters<typeof createActivity>[2] = {}) =>
    createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      title,
      publishAt: at(-3 * DAY),
      deadline: at(2 * DAY),
      sourceWorkId: fixture.id,
      sourceSubjectId: fixture.subjectId,
      ...extra,
    }).then((created) => created.activity.id);
  const get = async <T>(path: string) => {
    const res = await client.get(path);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as T;
  };
  /** Every page of `GET /me/activities` with `pageSize=1`. */
  const listAll = async (status?: string) => {
    const found: string[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ pageSize: "1", ...(status ? { status } : {}) });
      if (cursor) params.set("cursor", cursor);
      const page: StudentActivityPage = await get(`/api/me/activities?${params}`);
      found.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor !== null && found.length < 50);
    return found;
  };
  /** Every page of `GET /me/history` with `pageSize=1`. */
  const historyAll = async (query: Record<string, string> = {}) => {
    const pages: StudentHistoryPage[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ ...query, pageSize: "1" });
      if (cursor) params.set("cursor", cursor);
      const page: StudentHistoryPage = await get(`/api/me/history?${params}`);
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
    teacherA = await createUser(t, { roles: ["TEACHER"] });
    const teacherB = await createUser(t, { roles: ["TEACHER"] });
    const syllabusA = await createConfirmedSyllabus(t, teacherA.id);
    const syllabusB = await createConfirmedSyllabus(t, teacherB.id);
    workA = await createWork(t, teacherA.id, { syllabus: syllabusA });
    workB = await createWork(t, teacherB.id, { syllabus: syllabusB });
    classA = await createClass(t, teacherA.id, { subjectId: syllabusA.subject.id });
    classB = await createClass(t, teacherB.id, { cohortId: classA.cohortId, subjectId: syllabusB.subject.id });
    student = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, classA.id, student.id);
    client = api(t, { cookie: await loginAs(t, student) });

    const pendente = await work(classA, workA, "Pendente");
    const emAndamento = await work(classA, workA, "Em andamento");
    await createAttemptRow(t, emAndamento, student.id, { startedAt: at(-HOUR) });
    const atrasadaAceita = await work(classA, workA, "Atrasada aceita", { deadline: at(-DAY), latePolicy: "ACCEPT_MARKED" });
    const atrasadaRejeitada = await work(classA, workA, "Atrasada rejeitada", { deadline: at(-DAY), latePolicy: "REJECT" });
    rejectedAttemptId = (await createAttemptRow(t, atrasadaRejeitada, student.id, { startedAt: at(-2 * DAY) })).attemptId;
    const entregue = await work(classA, workA, "Entregue");
    await createAttemptRow(t, entregue, student.id, { startedAt: at(-2 * HOUR), submission: { submittedAt: at(-HOUR) } });
    const corrigida = await work(classA, workA, "Corrigida", { resultReleasedAt: at(-MINUTE) });
    await createAttemptRow(t, corrigida, student.id, { startedAt: at(-3 * HOUR), submission: { submittedAt: at(-2 * HOUR), gradeCents: 80 } });
    const exercicio = (await createActivity(t, classA, { type: "EXERCISE", title: "Exercício concluído", publishAt: at(-3 * DAY) })).activity.id;
    await createAttemptRow(t, exercicio, student.id, { startedAt: at(-4 * HOUR), number: 1, completedAt: at(-3 * HOUR) });
    const encerrada = await work(classA, workA, "Encerrada", { status: "CLOSED" });
    const arquivada = await work(classB, workB, "Da disciplina arquivada");
    archivedAt = at(-5 * HOUR);
    await t.prisma.schoolClass.update({ where: { id: classB.id }, data: { status: "ARCHIVED", statusChangedAt: archivedAt } });
    // A held exam of a closed activity: still in course for the student until the teacher decides (018 FR-019).
    const provaRetida = (await createActivity(t, classA, { type: "EXAM", title: "Prova retida", publishAt: at(-HOUR) })).activity.id;
    await t.prisma.activityAttendance.create({
      data: { activityId: provaRetida, studentUserId: student.id, classId: classA.id, markedAt: at(-40 * MINUTE), markedById: teacherA.id },
    });
    const examAttempt = await createAttemptRow(t, provaRetida, student.id, { startedAt: at(-30 * MINUTE) });
    await holdByHand(t, { id: examAttempt.attemptId, activityId: provaRetida, studentUserId: student.id }, at(-20 * MINUTE));
    await t.prisma.classActivity.update({ where: { id: provaRetida }, data: { status: "CLOSED", closedAt: at(-10 * MINUTE) } });

    ids = { pendente, emAndamento, atrasadaAceita, atrasadaRejeitada, entregue, corrigida, exercicio, encerrada, arquivada, provaRetida };
  });

  it("028/US5-1 028/US5-3 028/FR-023 Minhas atividades: só o que ainda dá para fazer, em todos os filtros e páginas", async () => {
    expect(new Set(await listAll())).toEqual(new Set([ids.pendente, ids.emAndamento, ids.atrasadaAceita, ids.provaRetida]));
    expect(await listAll("PENDING")).toEqual([ids.pendente]);
    expect(new Set(await listAll("IN_PROGRESS"))).toEqual(new Set([ids.emAndamento, ids.provaRetida]));
    expect(await listAll("OVERDUE")).toEqual([ids.atrasadaAceita]);
    const completed = await client.get("/api/me/activities?status=COMPLETED");
    expect(completed.status).toBe(400);
    expect(completed.body.code).toBe("VALIDATION_ERROR");
  });

  it("028/US5-2 028/FR-024 Histórico: as não entregues na aba própria, sem nota, fora dos cards, pela data em que fecharam", async () => {
    const all = (await historyAll()).flatMap((page) => page.items);
    expect(new Set(all.map((item) => item.id))).toEqual(
      new Set([ids.entregue, ids.corrigida, ids.exercicio, ids.atrasadaRejeitada, ids.encerrada, ids.arquivada]),
    );
    const pages = await historyAll({ tab: "MISSED" });
    const missed = pages.flatMap((page) => page.items);
    // The close (now, by the helper) is the latest, then the archive (5 h ago), then the deadline (a day ago).
    expect(missed.map((item) => item.id)).toEqual([ids.encerrada, ids.arquivada, ids.atrasadaRejeitada]);
    for (const item of missed) {
      expect(item).toMatchObject({ situation: "MISSED", deliveredAt: null, result: null });
      // 029/FR-006: `missedAt` became `endedAt`; this suite is rewritten by the 029 rule in T020.
      expect(item.endedAt).not.toBeNull();
    }
    expect(missed.find((item) => item.id === ids.atrasadaRejeitada)!.endedAt).toBe(at(-DAY).toISOString());
    expect(missed.find((item) => item.id === ids.arquivada)!.endedAt).toBe(archivedAt.toISOString());
    for (const page of pages) {
      expect(page.tabCounts).toEqual({ all: 6, awaiting: 1, graded: 2, missed: 3 });
      expect(page.totals).toEqual({ delivered: 3, awaiting: 1, graded: 2, missed: 3 });
      expect(page.total).toBe(3);
    }
    // The search and the matéria apply to them as to the deliveries.
    expect((await historyAll({ tab: "MISSED", q: "arquivada" })).flatMap((page) => page.items).map((item) => item.id)).toEqual([ids.arquivada]);
    const onlyA = await get<StudentHistoryPage>(`/api/me/history?tab=MISSED&classId=${classA.id}`);
    expect(onlyA.items.map((item) => item.id)).toEqual([ids.encerrada, ids.atrasadaRejeitada]);
  });

  it("028/US5-4 028/FR-025 Painel: Concluídas conta as entregas; Atrasadas só as que aceitam entrega", async () => {
    const body = await get<StudentDashboard>("/api/me/dashboard");
    expect(body.counts).toEqual({ pending: 1, inProgress: 2, overdue: 1, completed: 3 });
    expect(body.overdueOpen.map((item) => item.id)).toEqual([ids.atrasadaAceita]);
    expect(body.next.map((item) => item.id)).not.toContain(ids.arquivada);
  });

  it("028/US5-5 aba Não entregues vazia: a lista e o total vazios, as contagens zeradas só nela", async () => {
    const body = await get<StudentHistoryPage>(`/api/me/history?tab=MISSED&q=${encodeURIComponent("nada assim")}`);
    expect(body).toMatchObject({ items: [], total: 0, tabCounts: { all: 0, awaiting: 0, graded: 0, missed: 0 } });
  });

  it("028/US5-6 a aceitação tardia do professor tira a atividade de Não entregues e a torna uma entrega", async () => {
    // The student saved something before the deadline (acceptance needs a saved answer, 012 FR-006b).
    const question = await t.prisma.classActivityQuestion.findFirstOrThrow({
      where: { activityId: ids.atrasadaRejeitada },
      select: { id: true, type: true, alternatives: { select: { id: true }, take: 1 } },
    });
    await t.prisma.activityAnswer.create({
      data: {
        attemptId: rejectedAttemptId,
        activityId: ids.atrasadaRejeitada,
        questionId: question.id,
        questionType: question.type,
        alternativeId: question.alternatives[0]!.id,
        savedAt: at(-2 * DAY + HOUR),
        savedByUserId: student.id,
      },
    });
    const teacher = api(t, { cookie: await loginAs(t, teacherA) });
    const res = await acceptSubmission(teacher, classA.id, ids.atrasadaRejeitada, rejectedAttemptId);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    const items = (await historyAll()).flatMap((page) => page.items);
    const accepted = items.find((item) => item.id === ids.atrasadaRejeitada)!;
    expect(accepted).toMatchObject({ situation: "AWAITING", missedAt: null });
    expect(accepted.deliveredAt).not.toBeNull();
    expect((await get<StudentHistoryPage>("/api/me/history?tab=MISSED")).tabCounts.missed).toBe(2);
  });

  it("028/SC-008 cada atividade em exatamente uma das duas telas", async () => {
    const open = new Set(await listAll());
    const history = new Set((await historyAll()).flatMap((page) => page.items).map((item) => item.id));
    for (const id of Object.values(ids)) expect(open.has(id) !== history.has(id), id).toBe(true);
  });
});
