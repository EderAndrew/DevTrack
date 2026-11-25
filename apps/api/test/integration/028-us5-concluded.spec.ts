import type { StudentActivityPage, StudentDashboard, StudentHistoryPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { acceptSubmission, closeByHand, createActivity, createAttemptRow } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { holdByHand } from "../helpers/exams";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 028/US5 (amendment 2026-11-23), superseded by 029 (FR-001, FR-007–FR-009, research HC1, HC8): the 028 ids stay, the
 * expectations follow the 029 rule — the "Histórico" holds only the works and exams the teacher closed or cancelled;
 * every exercise and every ACTIVE work or exam (delivered, overdue or of an archived disciplina) stays in "Minhas
 * atividades". One student with an activity in each situation, in a turma with an active disciplina (A) and an
 * archived one (B).
 */

type Client = ReturnType<typeof api>;

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();

describe("028/US5 029/SC-005 concluídas só no Histórico, pela regra da 029", () => {
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
  let closedAt: Date;

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
    const encerrada = await work(classA, workA, "Encerrada");
    closedAt = at(-5 * HOUR);
    await closeByHand(t, encerrada, closedAt);
    const arquivada = await work(classB, workB, "Da disciplina arquivada");
    await t.prisma.schoolClass.update({ where: { id: classB.id }, data: { status: "ARCHIVED", statusChangedAt: at(-5 * HOUR) } });
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

  it("028/US5-1 028/US5-3 028/FR-023 Minhas atividades: exercícios e trabalhos/provas ativos, em todos os filtros e páginas", async () => {
    // 029/FR-007: every ACTIVE work (delivered, overdue accepting or not, of an archived disciplina) and the exercise.
    expect(new Set(await listAll())).toEqual(
      new Set([ids.pendente, ids.emAndamento, ids.atrasadaAceita, ids.atrasadaRejeitada, ids.entregue, ids.corrigida, ids.exercicio, ids.arquivada]),
    );
    // 029/FR-007: the ACTIVE work of the archived disciplina is pending, read-only (029 Assumptions).
    expect(new Set(await listAll("PENDING"))).toEqual(new Set([ids.pendente, ids.arquivada]));
    expect(await listAll("IN_PROGRESS")).toEqual([ids.emAndamento]);
    // 029/FR-009: "Atrasadas" lists every overdue of the list, accepting or not.
    expect(new Set(await listAll("OVERDUE"))).toEqual(new Set([ids.atrasadaAceita, ids.atrasadaRejeitada]));
    // 029/FR-008: "Entregues/concluídas" is back.
    expect(new Set(await listAll("COMPLETED"))).toEqual(new Set([ids.entregue, ids.corrigida, ids.exercicio]));
  });

  it("028/US5-2 028/FR-024 Histórico: as não entregues na aba própria, sem nota, fora dos cards, pela data em que fecharam", async () => {
    const all = (await historyAll()).flatMap((page) => page.items);
    // 029/FR-001: only the works and exams the teacher closed (the held exam awaits the decision, 029 HC4).
    expect(new Set(all.map((item) => item.id))).toEqual(new Set([ids.encerrada, ids.provaRetida]));
    const pages = await historyAll({ tab: "MISSED" });
    const missed = pages.flatMap((page) => page.items);
    expect(missed.map((item) => item.id)).toEqual([ids.encerrada]);
    // 029/FR-006: dated by the close.
    expect(missed[0]).toMatchObject({ situation: "MISSED", deliveredAt: null, result: null, endedAt: closedAt.toISOString() });
    for (const page of pages) {
      expect(page.tabCounts).toEqual({ all: 2, awaiting: 1, graded: 0, missed: 1, cancelled: 0 });
      expect(page.totals).toEqual({ delivered: 1, awaiting: 1, graded: 0, missed: 1, cancelled: 0 });
      expect(page.total).toBe(1);
    }
    // The search and the matéria apply to them as to the deliveries.
    expect((await historyAll({ tab: "MISSED", q: "encerrada" })).flatMap((page) => page.items).map((item) => item.id)).toEqual([ids.encerrada]);
    expect((await historyAll({ tab: "MISSED", q: "arquivada" })).flatMap((page) => page.items)).toEqual([]);
    const onlyA = await get<StudentHistoryPage>(`/api/me/history?tab=MISSED&classId=${classA.id}`);
    expect(onlyA.items.map((item) => item.id)).toEqual([ids.encerrada]);
  });

  it("028/US5-4 028/FR-025 Painel: contadores da lista; Concluídas conta as linhas do Histórico", async () => {
    const body = await get<StudentDashboard>("/api/me/dashboard");
    // 029/FR-009: "Atrasadas" counts every overdue of the list; "Concluídas" the rows of the Histórico.
    expect(body.counts).toEqual({ pending: 2, inProgress: 1, overdue: 2, completed: 2 });
    expect(body.overdueOpen.map((item) => item.id)).toEqual([ids.atrasadaAceita]);
    expect(body.next.map((item) => item.id)).not.toContain(ids.provaRetida);
  });

  it("028/US5-5 aba Não entregues vazia: a lista e o total vazios, as contagens zeradas só nela", async () => {
    const body = await get<StudentHistoryPage>(`/api/me/history?tab=MISSED&q=${encodeURIComponent("nada assim")}`);
    expect(body).toMatchObject({ items: [], total: 0, tabCounts: { all: 0, awaiting: 0, graded: 0, missed: 0, cancelled: 0 } });
  });

  it("028/US5-6 a aceitação tardia do professor torna a atrasada uma entrega, ainda em Minhas atividades", async () => {
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
    // 029/FR-007, FR-008: still ACTIVE, so it moves from "Atrasadas" to "Entregues/concluídas" of the list.
    expect(await listAll("OVERDUE")).toEqual([ids.atrasadaAceita]);
    expect(await listAll("COMPLETED")).toContain(ids.atrasadaRejeitada);
    const page = await get<StudentActivityPage>("/api/me/activities?status=COMPLETED&pageSize=50");
    expect(page.items.find((item) => item.id === ids.atrasadaRejeitada)).toMatchObject({ status: "SUBMITTED", late: true });
    expect((await get<StudentHistoryPage>("/api/me/history")).items.map((item) => item.id)).not.toContain(ids.atrasadaRejeitada);
  });

  it("028/SC-008 cada atividade em exatamente uma das duas telas", async () => {
    const open = new Set(await listAll());
    const history = new Set((await historyAll()).flatMap((page) => page.items).map((item) => item.id));
    for (const id of Object.values(ids)) expect(open.has(id) !== history.has(id), id).toBe(true);
  });
});
