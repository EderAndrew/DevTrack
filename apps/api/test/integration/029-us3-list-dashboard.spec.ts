import type { StudentActivityPage, StudentActivitySummary, StudentDashboard, StudentHistoryPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { cancelByHand, closeByHand, createActivity, createAttemptRow } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { holdByHand } from "../helpers/exams";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 029/US3 (FR-007–FR-009, research HC1, HC5, HC6): "Minhas atividades" holds every exercise and every ACTIVE work or
 * exam, in any 012/013 status, with the filter "Entregues/concluídas" (`COMPLETED`) back; the Painel counts the list and
 * its "Concluídas" the rows of the Histórico. One student with an activity in each situation of 029/SC-001, in two
 * disciplinas (A and B) of the same turma.
 */

type Client = ReturnType<typeof api>;

/** Held exams compare the end with the database's `now()` (apps/api/CLAUDE.md): the clock starts at the real minute. */
const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();

type Situation =
  | "pendente"
  | "emAndamento"
  | "atrasadaAceita"
  | "atrasadaRejeitada"
  | "provaJanelaFechada"
  | "entregue"
  | "corrigida"
  | "exercicioAtivo"
  | "exercicioEncerrado"
  | "encerradaEntregue"
  | "provaEncerradaSemEntrega"
  | "provaRetida"
  | "canceladaEntregue"
  | "provaCanceladaSemEntrega"
  | "outraMateria";

/** Where each situation of 029/SC-001 lives, and its status in the list or its situation in the Histórico. */
const EXPECTED: Record<Situation, { list: StudentActivitySummary["status"] } | { history: string }> = {
  pendente: { list: "PENDING" },
  emAndamento: { list: "IN_PROGRESS" },
  atrasadaAceita: { list: "OVERDUE" },
  atrasadaRejeitada: { list: "OVERDUE" },
  provaJanelaFechada: { list: "OVERDUE" },
  entregue: { list: "SUBMITTED" },
  corrigida: { list: "GRADED" },
  exercicioAtivo: { list: "COMPLETED" },
  exercicioEncerrado: { list: "COMPLETED" },
  encerradaEntregue: { history: "AWAITING" },
  provaEncerradaSemEntrega: { history: "MISSED" },
  provaRetida: { history: "AWAITING" },
  canceladaEntregue: { history: "CANCELLED" },
  provaCanceladaSemEntrega: { history: "CANCELLED" },
  outraMateria: { list: "PENDING" },
};

describe("029/US3 Minhas atividades e o Painel com tudo o que está ativo", () => {
  let t: TestApp;
  let clock: FixedClock;
  let classA: SchoolClass;
  let classB: SchoolClass;
  let workA: WorkFixture;
  let teacherA: TestUser;
  let student: TestUser;
  let client: Client;
  let ids: Record<Situation, string>;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const work = (title: string, extra: Parameters<typeof createActivity>[2] = {}) =>
    createActivity(t, classA, {
      type: "ASSIGNMENT",
      title,
      publishAt: at(-3 * DAY),
      deadline: at(2 * DAY),
      sourceWorkId: workA.id,
      sourceSubjectId: workA.subjectId,
      ...extra,
    }).then((created) => created.activity.id);
  /** An exam of A published `ago`, the student marked present (016/018: an exam is only for those present). */
  const exam = async (title: string, ago: number, deadline?: Date) => {
    const id = (await createActivity(t, classA, { type: "EXAM", title, publishAt: at(-ago), deadline })).activity.id;
    await t.prisma.activityAttendance.create({
      data: { activityId: id, studentUserId: student.id, classId: classA.id, markedAt: at(-ago + MINUTE), markedById: teacherA.id },
    });
    return id;
  };
  const get = async <T>(path: string) => {
    const res = await client.get(path);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as T;
  };
  /** Every page of `GET /me/activities` with `pageSize=1`. */
  const listAll = async (query: Record<string, string> = {}) => {
    const found: StudentActivitySummary[] = [];
    let cursor: string | null = null;
    do {
      const params = new URLSearchParams({ ...query, pageSize: "1" });
      if (cursor) params.set("cursor", cursor);
      const page: StudentActivityPage = await get(`/api/me/activities?${params}`);
      found.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== null && found.length < 50);
    return found;
  };
  const listIds = async (query: Record<string, string> = {}) => new Set((await listAll(query)).map((item) => item.id));
  const pick = (...names: Situation[]) => new Set(names.map((name) => ids[name]));

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
    const workB = await createWork(t, teacherB.id, { syllabus: syllabusB });
    classA = await createClass(t, teacherA.id, { subjectId: syllabusA.subject.id });
    classB = await createClass(t, teacherB.id, { cohortId: classA.cohortId, subjectId: syllabusB.subject.id });
    student = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, classA.id, student.id);
    client = api(t, { cookie: await loginAs(t, student) });

    const pendente = await work("Pendente");
    const emAndamento = await work("Em andamento");
    await createAttemptRow(t, emAndamento, student.id, { startedAt: at(-HOUR) });
    const atrasadaAceita = await work("Atrasada aceita", { deadline: at(-DAY), latePolicy: "ACCEPT_MARKED" });
    const atrasadaRejeitada = await work("Atrasada rejeitada", { deadline: at(-DAY), latePolicy: "REJECT" });
    // 032: published two hours ago, its period ended an hour ago, never started: no longer accepts a start.
    const provaJanelaFechada = await exam("Prova com janela fechada", 2 * HOUR, at(-HOUR));
    const entregue = await work("Entregue");
    await createAttemptRow(t, entregue, student.id, { startedAt: at(-2 * HOUR), submission: { submittedAt: at(-HOUR) } });
    const corrigida = await work("Corrigida", { resultReleasedAt: at(-MINUTE) });
    await createAttemptRow(t, corrigida, student.id, { startedAt: at(-3 * HOUR), submission: { submittedAt: at(-2 * HOUR), gradeCents: 80 } });
    const exercicioAtivo = (await createActivity(t, classA, { type: "EXERCISE", title: "Exercício ativo", publishAt: at(-3 * DAY) })).activity.id;
    await createAttemptRow(t, exercicioAtivo, student.id, { startedAt: at(-4 * HOUR), number: 1, completedAt: at(-3 * HOUR) });
    const exercicioEncerrado = (await createActivity(t, classA, { type: "EXERCISE", title: "Exercício encerrado", publishAt: at(-3 * DAY) }))
      .activity.id;
    await createAttemptRow(t, exercicioEncerrado, student.id, { startedAt: at(-4 * HOUR), number: 1, completedAt: at(-3 * HOUR) });
    await closeByHand(t, exercicioEncerrado, at(-2 * HOUR));
    const encerradaEntregue = await work("Encerrada entregue");
    await createAttemptRow(t, encerradaEntregue, student.id, { startedAt: at(-6 * HOUR), submission: { submittedAt: at(-5 * HOUR) } });
    await closeByHand(t, encerradaEntregue, at(-4 * HOUR));
    const provaEncerradaSemEntrega = await exam("Prova encerrada sem entrega", 2 * DAY);
    await closeByHand(t, provaEncerradaSemEntrega, at(-DAY));
    const provaRetida = await exam("Prova retida", HOUR);
    const examAttempt = await createAttemptRow(t, provaRetida, student.id, { startedAt: at(-50 * MINUTE) });
    await holdByHand(t, { id: examAttempt.attemptId, activityId: provaRetida, studentUserId: student.id }, at(-20 * MINUTE));
    await closeByHand(t, provaRetida, at(-10 * MINUTE));
    const canceladaEntregue = await work("Cancelada entregue", { resultReleasedAt: at(-2 * HOUR) });
    await createAttemptRow(t, canceladaEntregue, student.id, { startedAt: at(-DAY - HOUR), submission: { submittedAt: at(-DAY), gradeCents: 90 } });
    await cancelByHand(t, canceladaEntregue, at(-HOUR));
    const provaCanceladaSemEntrega = await exam("Prova cancelada sem entrega", 2 * DAY);
    await cancelByHand(t, provaCanceladaSemEntrega, at(-DAY));
    const outraMateria = (
      await createActivity(t, classB, {
        type: "ASSIGNMENT",
        title: "Da outra matéria",
        publishAt: at(-DAY),
        deadline: at(3 * DAY),
        sourceWorkId: workB.id,
        sourceSubjectId: workB.subjectId,
      })
    ).activity.id;

    ids = {
      pendente,
      emAndamento,
      atrasadaAceita,
      atrasadaRejeitada,
      provaJanelaFechada,
      entregue,
      corrigida,
      exercicioAtivo,
      exercicioEncerrado,
      encerradaEntregue,
      provaEncerradaSemEntrega,
      provaRetida,
      canceladaEntregue,
      provaCanceladaSemEntrega,
      outraMateria,
    };
  });

  it("029/US3-1 trabalho ativo entregue ou corrigido: na lista como Entregue/Corrigida, em Todas e em Entregues/concluídas", async () => {
    const all = await listAll();
    expect(all.find((item) => item.id === ids.entregue)).toMatchObject({ status: "SUBMITTED" });
    expect(all.find((item) => item.id === ids.corrigida)).toMatchObject({ status: "GRADED", result: { grade: "0.80" } });
    const completed = await listIds({ status: "COMPLETED" });
    expect(completed.has(ids.entregue) && completed.has(ids.corrigida)).toBe(true);
  });

  it("029/US3-2 exercício concluído, ativo ou encerrado: Concluída, em Todas e em Entregues/concluídas, e pode refazer", async () => {
    const all = await listAll();
    for (const id of [ids.exercicioAtivo, ids.exercicioEncerrado]) expect(all.find((item) => item.id === id), id).toMatchObject({ status: "COMPLETED" });
    // 029/FR-008: the filter lists the deliveries and conclusions of the list — nothing else.
    expect(await listIds({ status: "COMPLETED" })).toEqual(pick("entregue", "corrigida", "exercicioAtivo", "exercicioEncerrado"));
    // 013: the active one can still be retried (its page answers as before).
    const res = await client.get(`/api/me/activities/${ids.exercicioAtivo}`);
    expect(res.status).toBe(200);
  });

  it("029/US3-3 ativo sem entrega que não aceita mais entrega: Atrasada, em Todas e no filtro Atrasadas", async () => {
    const all = await listAll();
    for (const id of [ids.atrasadaRejeitada, ids.provaJanelaFechada]) {
      expect(all.find((item) => item.id === id), id).toMatchObject({ status: "OVERDUE", canAnswer: false });
    }
    expect(await listIds({ status: "OVERDUE" })).toEqual(pick("atrasadaAceita", "atrasadaRejeitada", "provaJanelaFechada"));
  });

  it("029/US3-4 trabalho ou prova encerrado ou cancelado: em nenhum filtro, lista ou contagem", async () => {
    const out = pick("encerradaEntregue", "provaEncerradaSemEntrega", "provaRetida", "canceladaEntregue", "provaCanceladaSemEntrega");
    for (const status of [undefined, "PENDING", "IN_PROGRESS", "OVERDUE", "COMPLETED"]) {
      for (const type of [undefined, "ASSIGNMENT", "EXAM"]) {
        const found = await listIds({ ...(status ? { status } : {}), ...(type ? { type } : {}) });
        for (const id of out) expect(found.has(id), `${status}/${type}`).toBe(false);
      }
    }
    const dashboard = await get<StudentDashboard>("/api/me/dashboard");
    const shown = [...dashboard.next, ...dashboard.overdueOpen].map((item) => item.id);
    for (const id of out) expect(shown).not.toContain(id);
  });

  it("029/US3-5 Painel: Pendentes, Em andamento e Atrasadas da lista; Concluídas = linhas do Histórico da mesma matéria", async () => {
    const all = await get<StudentDashboard>("/api/me/dashboard");
    // The list: pendente + outraMateria; emAndamento; three overdue (accepting or not).
    expect(all.counts).toEqual({ pending: 2, inProgress: 1, overdue: 3, completed: 5 });
    expect(all.overdueOpen.map((item) => item.id)).toEqual([ids.atrasadaAceita]);
    const history = await get<StudentHistoryPage>("/api/me/history");
    expect(all.counts.completed).toBe(history.tabCounts.all);

    const onlyA = await get<StudentDashboard>(`/api/me/dashboard?classId=${classA.id}`);
    expect(onlyA.counts).toEqual({ pending: 1, inProgress: 1, overdue: 3, completed: 5 });
    const onlyB = await get<StudentDashboard>(`/api/me/dashboard?classId=${classB.id}`);
    expect(onlyB.counts).toEqual({ pending: 1, inProgress: 0, overdue: 0, completed: 0 });
    expect((await get<StudentHistoryPage>(`/api/me/history?classId=${classB.id}`)).tabCounts.all).toBe(0);
  });

  it("029/SC-001 cada atividade em exatamente uma das duas telas, na situação esperada, e as contagens batem", async () => {
    const list = new Map((await listAll()).map((item) => [item.id, item.status]));
    const historyPage = await get<StudentHistoryPage>("/api/me/history?pageSize=50");
    const history = new Map(historyPage.items.map((item) => [item.id, item.situation]));
    for (const [name, expected] of Object.entries(EXPECTED) as [Situation, (typeof EXPECTED)[Situation]][]) {
      const id = ids[name];
      expect({ name, inList: list.has(id), inHistory: history.has(id) }).toEqual({ name, inList: "list" in expected, inHistory: "history" in expected });
      if ("list" in expected) expect({ name, status: list.get(id) }).toEqual({ name, status: expected.list });
      else expect({ name, situation: history.get(id) }).toEqual({ name, situation: expected.history });
    }
    expect(list.size + history.size).toBe(Object.keys(EXPECTED).length);
    expect(historyPage.tabCounts).toEqual({ all: 5, awaiting: 2, graded: 0, missed: 1, cancelled: 2 });
    expect(historyPage.totals).toEqual({ delivered: 2, awaiting: 2, graded: 0, missed: 1, cancelled: 2 });
  });
});
