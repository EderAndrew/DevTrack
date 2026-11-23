import { type StudentHistoryPage, StudentHistoryItemSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createClass, createEnrollment, loginAs, createUser, type TestUser } from "../helpers/factories";
import { captureLogs, type LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 028/US4 — nothing of a grade before the release (028/FR-009, FR-010, FR-018; 012/SC-004): the totals, the tabs and
 * the list never reveal a grade, a feedback or a correction the student can't see yet. A delivery is GRADED only with
 * the 012 `result` (released ∧ grading complete ∧ `notas.proprias.visualizar`); every item is the 012 allowlist plus
 * `deliveredAt` and `situation`; the reads write no audit event (contracts/audit-events.md).
 *
 * Part 1 (T018). Part 2 (T022, US3), below, adds the `classId`, the validation and the log redaction.
 *
 * The clock starts at the real time, as 018's suites: the exam triggers compare with the database clock.
 */

type Client = ReturnType<typeof api>;

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();
/** One capture for both apps of the file: nestjs-pino may send logs to the first app created (apps/api/CLAUDE.md). */
const logs: LogCapture = captureLogs();
const FEEDBACK_UNRELEASED = "FEEDBACK-NAO-LIBERADO-028";
const FEEDBACK_PARTIAL = "FEEDBACK-CORRECAO-INCOMPLETA-028";
const FEEDBACK_EXAM = "FEEDBACK-PROVA-028";
const FEEDBACK_RELEASED = "FEEDBACK-LIBERADO-028";
/** The seeded grades no student may read before the release; `totalGrade` (1.00) is public. */
const HIDDEN = ["0.73", "0.41", "0.59", FEEDBACK_UNRELEASED, FEEDBACK_PARTIAL, FEEDBACK_EXAM];
const TABS = ["", "?tab=AWAITING", "?tab=GRADED"] as const;
const SHAPE = StudentHistoryItemSchema.shape;
const ALLOWED_KEYS = Object.keys(SHAPE).sort();
/** The keys every item carries; the optional ones (023 `groupSize`, only on a group work) may be absent. */
const REQUIRED_KEYS = ALLOWED_KEYS.filter((key) => !SHAPE[key as keyof typeof SHAPE].safeParse(undefined).success);

describe("028/US4 nada de nota antes da liberação", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let work: WorkFixture;
  let student: TestUser;
  let classmate: TestUser;
  let client: Client;
  const ids = {} as Record<"unreleased" | "partial" | "exam" | "released", string>;

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
  const markPresent = (activityId: string, studentUserId: string) =>
    t.prisma.activityAttendance.create({
      data: { activityId, studentUserId, classId: schoolClass.id, markedAt: at(-DAY), markedById: teacher.id },
    });
  const withoutGradePermission = async (body: () => Promise<void>) => {
    const grant = await t.prisma.rolePermission.findFirstOrThrow({
      where: { role: { key: "STUDENT" }, permission: { key: "notas.proprias.visualizar" } },
    });
    await t.prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } } });
    try {
      await body();
    } finally {
      await t.prisma.rolePermission.create({ data: { roleId: grant.roleId, permissionId: grant.permissionId } });
    }
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock, logs });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus });
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    schoolClass = created.schoolClass;
    [student, classmate] = created.students as [TestUser, TestUser];
    client = api(t, { cookie: await loginAs(t, student) });

    // Todas as notas lançadas, resultado não liberado.
    const unreleased = await assignment("Trabalho corrigido sem liberação");
    await createAttemptRow(t, unreleased.activity.id, student.id, {
      startedAt: at(-5 * HOUR),
      submission: { submittedAt: at(-4 * HOUR), gradeCents: 73, generalFeedback: FEEDBACK_UNRELEASED },
    });
    // Liberado, mas com a correção incompleta.
    const partial = await assignment("Trabalho com correção incompleta", { resultReleasedAt: at(-HOUR) });
    await createAttemptRow(t, partial.activity.id, student.id, {
      startedAt: at(-7 * HOUR),
      submission: { submittedAt: at(-6 * HOUR), gradeCents: 41, gradePartial: true, generalFeedback: FEEDBACK_PARTIAL },
    });
    // Prova entregue, com nota lançada e sem liberação.
    const exam = await createActivity(t, schoolClass, { type: "EXAM", title: "Prova sem liberação", publishAt: at(-DAY) });
    await markPresent(exam.activity.id, student.id);
    await createAttemptRow(t, exam.activity.id, student.id, {
      startedAt: at(-9 * HOUR),
      submission: { submittedAt: at(-8 * HOUR), endReason: "STUDENT_SUBMITTED", gradeCents: 59, generalFeedback: FEEDBACK_EXAM },
    });
    // Controle: liberado com correção completa.
    const released = await assignment("Trabalho liberado", { resultReleasedAt: at(-HOUR) });
    await createAttemptRow(t, released.activity.id, student.id, {
      startedAt: at(-2 * DAY - HOUR),
      submission: { submittedAt: at(-2 * DAY), gradeCents: 88, generalFeedback: FEEDBACK_RELEASED },
    });

    ids.unreleased = unreleased.activity.id;
    ids.partial = partial.activity.id;
    ids.exam = exam.activity.id;
    ids.released = released.activity.id;
  });

  it("028/US4-1 notas lançadas sem liberação: AWAITING, result nulo e nenhuma nota ou feedback no corpo, em toda aba", async () => {
    for (const tab of TABS) {
      const body = await historyOf(client, tab);
      const json = JSON.stringify(body);
      for (const hidden of HIDDEN) expect(json, `${tab} ${hidden}`).not.toContain(hidden);
      for (const id of [ids.unreleased, ids.exam]) {
        const item = body.items.find((entry) => entry.id === id);
        if (tab === "?tab=GRADED") expect(item).toBeUndefined();
        else expect(item).toMatchObject({ situation: "AWAITING", result: null });
      }
    }
  });

  it("028/US4-2 liberada com correção incompleta: AWAITING e sem nota", async () => {
    const body = await historyOf(client);
    expect(body.items.find((entry) => entry.id === ids.partial)).toMatchObject({ situation: "AWAITING", result: null });
    expect(body.totals).toEqual({ delivered: 4, awaiting: 3, graded: 1 });
    expect((await historyOf(client, "?tab=GRADED")).items.map((item) => item.id)).toEqual([ids.released]);
  });

  it("028/US4-3 sem notas.proprias.visualizar: nada corrigido, a aba Corrigidas vazia e nenhum result", async () => {
    await withoutGradePermission(async () => {
      for (const tab of TABS) {
        const body = await historyOf(client, tab);
        expect(body.totals.graded).toBe(0);
        expect(body.tabCounts.graded).toBe(0);
        expect(body.items.every((item) => item.result === null && item.situation === "AWAITING")).toBe(true);
        expect(JSON.stringify(body)).not.toMatch(/"grade"|0\.88|FEEDBACK-/);
      }
      expect((await historyOf(client, "?tab=GRADED")).items).toEqual([]);
    });
  });

  it("028/US4-4 028/SC-002 cada item tem só as chaves da lista permitida, em toda aba", async () => {
    for (const tab of TABS) {
      const body = await historyOf(client, tab);
      for (const item of body.items) {
        const keys = Object.keys(item);
        expect(ALLOWED_KEYS, `${tab} ${item.id}`).toEqual(expect.arrayContaining(keys));
        expect(keys, `${tab} ${item.id}`).toEqual(expect.arrayContaining(REQUIRED_KEYS));
        expect(StudentHistoryItemSchema.safeParse(item).success).toBe(true);
      }
    }
    // O resultado liberado mostra a nota (o controle), mas só os campos do 012.
    const released = (await historyOf(client)).items.find((entry) => entry.id === ids.released)!;
    expect(released).toMatchObject({ situation: "GRADED", result: { grade: "0.88", hasFeedback: true } });
    expect(JSON.stringify(released)).not.toContain(FEEDBACK_RELEASED);
  });

  it("028/US4 um aluno não vê a entrega de outro aluno da mesma turma", async () => {
    const own = await assignment("Trabalho do colega");
    await createAttemptRow(t, own.activity.id, classmate.id, {
      startedAt: at(-2 * HOUR),
      submission: { submittedAt: at(-HOUR), gradeCents: 64 },
    });
    const body = await historyOf(client);
    expect(body.items.map((item) => item.id)).not.toContain(own.activity.id);
    expect(body.totals.delivered).toBe(4);
    const classmateBody = await historyOf(api(t, { cookie: await loginAs(t, classmate) }));
    expect(classmateBody.items.map((item) => item.id)).toEqual([own.activity.id]);
    expect(JSON.stringify(classmateBody)).not.toMatch(/Trabalho corrigido|Prova sem liberação|Trabalho liberado/);
  });

  it("028/US4 016: um aluno não marcado presente não tem o trabalho no histórico", async () => {
    const gated = await assignment("Trabalho com chamada", { releaseMode: "PRESENT_ONLY" });
    await markPresent(gated.activity.id, classmate.id);
    await createAttemptRow(t, gated.activity.id, classmate.id, {
      startedAt: at(-2 * HOUR),
      submission: { submittedAt: at(-HOUR) },
    });
    const body = await historyOf(client);
    expect(body.items.map((item) => item.id)).not.toContain(gated.activity.id);
    expect(JSON.stringify(body)).not.toContain("Trabalho com chamada");
    const classmateBody = await historyOf(api(t, { cookie: await loginAs(t, classmate) }));
    expect(classmateBody.items.map((item) => item.id)).toContain(gated.activity.id);
  });

  it("028/US4 o Histórico não grava activity_result.viewed nem outro evento", async () => {
    const before = await t.prisma.auditEvent.count();
    for (const tab of TABS) await historyOf(client, tab);
    expect(await t.prisma.auditEvent.count({ where: { type: "activity_result.viewed" } })).toBe(0);
    expect(await t.prisma.auditEvent.count()).toBe(before);
  });
});

/**
 * Part 2 (T022, US3): `classId` and the search on the security side (028/FR-017, SC-006; research HI6, HI8). A class
 * without an ACTIVE enrollment of the student is the same 404 whatever the reason; malformed input is a 400 before any
 * read; no read writes an audit event; the search text never reaches the logs.
 */
describe("028/US3 matéria e busca: isolamento, validação e logs", () => {
  let t: TestApp;
  let clock: FixedClock;
  let client: Client;
  let own: SchoolClass;
  let foreign: SchoolClass;
  let ended: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const deliver = async (schoolClass: SchoolClass, work: WorkFixture, studentId: string, title: string) => {
    const { activity } = await createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      title,
      publishAt: at(-3 * DAY),
      deadline: at(2 * DAY),
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
    });
    await createAttemptRow(t, activity.id, studentId, { startedAt: at(-2 * HOUR), submission: { submittedAt: at(-HOUR) } });
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock, logs });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const work = await createWork(t, teacher.id, { syllabus });
    const student = await createUser(t, { roles: ["STUDENT"] });
    const other = await createUser(t, { roles: ["STUDENT"] });
    own = await createClass(t, teacher.id, { subjectId: syllabus.subject.id });
    foreign = await createClass(t, teacher.id, { subjectId: syllabus.subject.id });
    ended = await createClass(t, teacher.id, { subjectId: syllabus.subject.id });
    await createEnrollment(t, own.id, student.id);
    await createEnrollment(t, foreign.id, other.id);
    const endedEnrollment = await createEnrollment(t, ended.id, student.id);
    await deliver(own, work, student.id, "Entrega própria");
    await deliver(foreign, work, other.id, "ENTREGA-ALHEIA-028");
    await deliver(ended, work, student.id, "ENTREGA-ENCERRADA-028");
    await t.prisma.enrollment.update({ where: { id: endedEnrollment.id }, data: { status: "REMOVED", removedAt: clock.now(), removalReason: "MANAGER" } });
    client = api(t, { cookie: await loginAs(t, student) });
  });

  it("028/FR-017 028/SC-006 classId de outro aluno, de matrícula encerrada e inexistente → 404 com corpos idênticos", async () => {
    const bodies: unknown[] = [];
    for (const classId of [foreign.id, ended.id, "00000000-0000-4000-8000-000000000000"]) {
      for (const tab of ["", "&tab=GRADED", "&q=entrega"]) {
        const res = await client.get(`/api/me/history?classId=${classId}${tab}`);
        expect(res.status, `${classId}${tab}`).toBe(404);
        const json = JSON.stringify(res.body);
        expect(json).not.toMatch(/ENTREGA-|items|tabCounts|totals/);
        bodies.push(res.body);
      }
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
    expect(bodies[0]).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
    // Sem classId, a matrícula encerrada também sai do Histórico.
    const all = (await client.get("/api/me/history")).body as StudentHistoryPage;
    expect(all.items.map((item) => item.title)).toEqual(["Entrega própria"]);
  });

  it("028/FR-017 entradas mal formadas → 400 VALIDATION_ERROR, nunca 500", async () => {
    const bad = [
      "classId=abc",
      `q=${"a".repeat(101)}`,
      "q=%00",
      "tab=X",
      "pageSize=0",
      "desconhecido=1",
    ];
    for (const query of bad) {
      const res = await client.get(`/api/me/history?${query}`);
      expect(res.status, query).toBe(400);
      expect((res.body as { code: string }).code, query).toBe("VALIDATION_ERROR");
    }
    // 100 caracteres (code points) ainda são aceitos.
    expect((await client.get(`/api/me/history?q=${encodeURIComponent("é".repeat(100))}`)).status).toBe(200);
  });

  it("028/US3-6 nenhum evento de auditoria para esses pedidos", async () => {
    const before = await t.prisma.auditEvent.count();
    await client.get(`/api/me/history?classId=${own.id}&q=entrega`);
    await client.get(`/api/me/history?classId=${foreign.id}`);
    await client.get(`/api/me/history?classId=${ended.id}`);
    await client.get("/api/me/history?classId=abc");
    expect(await t.prisma.auditEvent.count()).toBe(before);
  });

  it("028/US3 a busca não vai para os logs: q=[REDACTED] em req.url", async () => {
    logs.clear();
    const res = await client.get(`/api/me/history?q=segredo-de-busca&classId=${own.id}`);
    expect(res.status).toBe(200);
    await client.get("/api/me/history?q=segredo-de-busca&tab=X");
    const text = logs.text();
    expect(text).not.toContain("segredo-de-busca");
    const urls = logs
      .lines()
      .map((line) => (line.req as { url?: string } | undefined)?.url)
      .filter((url): url is string => typeof url === "string" && url.includes("/me/history"));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/q=(\[REDACTED\]|%5BREDACTED%5D)/);
    expect(urls.some((url) => url.includes(`classId=${own.id}`))).toBe(true);
  });
});
