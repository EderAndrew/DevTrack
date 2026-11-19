import { type StudentHistoryPage, StudentHistoryItemSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { loginAs, createUser, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 028/US4 — nothing of a grade before the release (028/FR-009, FR-010, FR-018; 012/SC-004): the totals, the tabs and
 * the list never reveal a grade, a feedback or a correction the student can't see yet. A delivery is GRADED only with
 * the 012 `result` (released ∧ grading complete ∧ `notas.proprias.visualizar`); every item is the 012 allowlist plus
 * `deliveredAt` and `situation`; the reads write no audit event (contracts/audit-events.md).
 *
 * Part 1 (T018). Part 2 (T022, US3) adds the `classId`, the validation and the log redaction.
 *
 * The clock starts at the real time, as 018's suites: the exam triggers compare with the database clock.
 */

type Client = ReturnType<typeof api>;

const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();
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
    t = await createTestApp({ clock });
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
