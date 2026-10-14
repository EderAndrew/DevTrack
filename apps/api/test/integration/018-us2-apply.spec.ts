import { randomUUID } from "node:crypto";
import { type ScopeCheck, type TeacherActivity, type TeacherActivitySummary, type TeacherExam } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, createCompletedTopics, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { markPresent } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, examBody, postExam, toExamUpdateBody } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus } from "../helpers/works";

/**
 * 018/US2 — the teacher applies an approved exam to a class of its subject and takes the attendance
 * (018/FR-007…FR-010): the coverage per topic and per difficulty before confirming, the time fields
 * in their ranges, the class keeps a copy, and only the students marked present see it. The exam is
 * always CONTROLLED, without AI help and `PRESENT_ONLY`, set by the server: the body can't choose.
 */

const START = "2026-10-01T12:00:00.000Z";
const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
type Client = ReturnType<typeof api>;

describe("018/US2 professor aplica a prova à turma e faz a chamada", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let syllabus: ConfirmedSyllabus;
  let classId: string;
  let students: TestUser[];
  let exam: TeacherExam;

  const base = () => `/api/classes/${classId}/activities`;
  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const scopeCheck = (examId: string) => client.post(`${base()}/scope-check`, { type: "EXAM", examId });
  /** An exam applied through the route, with no attendance taken. */
  const applied = async (overrides: Parameters<typeof applyExam>[3] = {}) => {
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, attendance: "NONE", ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  const summaryOf = async (activityId: string) =>
    ((await client.get(base())).body.items as TeacherActivitySummary[]).find((item) => item.id === activityId)!;
  /** What the student sees of `activityId`: listed, on the dashboard, and the detail's status. */
  const sees = async (student: Client, activityId: string) => {
    const listed = (await student.get("/api/me/activities")).body.items.some((item: { id: string }) => item.id === activityId);
    const onDashboard = JSON.stringify((await student.get("/api/me/dashboard")).body).includes(activityId);
    return { listed, onDashboard, detail: (await student.get(`/api/me/activities/${activityId}`)).status };
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Ana Professora" });
    client = api(t, { cookie: await loginAs(t, teacher) });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 3 });
    classId = created.schoolClass.id;
    students = created.students;
    exam = await approvedExam(t, client, syllabus);
  });

  it("018/US2-1 018/FR-008 antes de confirmar, a cobertura por tópico e por dificuldade, com o tópico fora do escopo sinalizado", async () => {
    const res = await scopeCheck(exam.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const check = res.body as ScopeCheck;
    const topic = syllabus.itemIds[0]!;
    expect(check.hasPlan).toBe(false);
    expect(check.outOfScope).toEqual([{ syllabusItemId: topic, title: expect.any(String), questionPositions: [0, 1, 2] }]);
    expect(check.coverage).toEqual({
      byTopic: [{ syllabusItemId: topic, title: check.outOfScope[0]!.title, questions: 3, points: "10.00", outOfScope: true }],
      byDifficulty: [
        { difficulty: "BASIC", questions: 1, points: "3.34" },
        { difficulty: "INTERMEDIATE", questions: 1, points: "3.33" },
        { difficulty: "ADVANCED", questions: 1, points: "3.33" },
      ],
    });
    // Nothing is written by the check.
    expect(await t.prisma.classActivity.count()).toBe(0);

    // The topic taught in the class's plan: no longer flagged, and the application needs no confirmation.
    await createCompletedTopics(t, classId, syllabus.revision.id, [topic]);
    const taught = (await scopeCheck(exam.id)).body as ScopeCheck;
    expect(taught).toMatchObject({ hasPlan: true, outOfScope: [] });
    expect(taught.coverage!.byTopic).toEqual([expect.objectContaining({ syllabusItemId: topic, outOfScope: false })]);
    expect((await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: false })).status).toBe(201);
  });

  it("018/FR-008 tópico fora do escopo sem a confirmação explícita: recusado e nada gravado; com ela, auditado", async () => {
    const refused = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: false });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe("OUT_OF_SCOPE_NOT_ACKNOWLEDGED");
    expect(await t.prisma.classActivity.count()).toBe(0);
    const activity = await applied();
    expect(activity.outOfScopeTopicCount).toBe(1);
    const [published] = await events("activity.published");
    expect(published!.metadata).toMatchObject({ outOfScopeTopicCount: 1, hasPlan: false });
  });

  it("018/US2-2 018/FR-007 duração, inatividade e limite para iniciar fora das faixas são recusados pelo servidor; as bordas cabem", async () => {
    for (const fields of [
      { durationMinutes: 0 },
      { durationMinutes: 121 },
      { durationMinutes: 30.5 },
      { inactivityLimitSeconds: 29 },
      { inactivityLimitSeconds: 61 },
      { startWindowMinutes: -1 },
      { startWindowMinutes: 61 },
      { durationMinutes: undefined },
    ]) {
      const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, ...fields });
      expect(res.status, JSON.stringify(fields)).toBe(400);
    }
    expect(await t.prisma.classActivity.count()).toBe(0);

    const low = await applied({ durationMinutes: 1, inactivityLimitSeconds: 30, startWindowMinutes: 0 });
    expect(low.exam).toMatchObject({ durationMinutes: 1, inactivityLimitSeconds: 30, startWindowMinutes: 0 });
    const high = await applied({ durationMinutes: 120, inactivityLimitSeconds: 60, startWindowMinutes: 60 });
    expect(high.exam).toMatchObject({ durationMinutes: 120, inactivityLimitSeconds: 60, startWindowMinutes: 60 });
    // Left out: the defaults, 60 s of inactivity and 15 min to start.
    const defaults = await applied({ inactivityLimitSeconds: undefined, startWindowMinutes: undefined });
    expect(defaults.exam).toMatchObject({ inactivityLimitSeconds: 60, startWindowMinutes: 15 });
  });

  it("018/FR-007 a atividade guarda as faixas e o fechamento derivado: limite para iniciar + duração", async () => {
    const publishAt = new Date(clock.now().getTime() + 60 * MINUTE).toISOString();
    const activity = await applied({ publishAt, durationMinutes: 30, inactivityLimitSeconds: 45, startWindowMinutes: 10 });
    expect(activity).toMatchObject({
      type: "EXAM",
      phase: "SCHEDULED",
      publishAt,
      deadline: null,
      latePolicy: null,
      totalGrade: "10.00",
      possiblePoints: null,
      source: { examId: exam.id },
      exam: {
        durationMinutes: 30,
        inactivityLimitSeconds: 45,
        startWindowMinutes: 10,
        startDeadline: new Date(Date.parse(publishAt) + 10 * MINUTE).toISOString(),
        closesAt: new Date(Date.parse(publishAt) + 40 * MINUTE).toISOString(),
        pendingDecisions: 0,
      },
    });
    expect((await summaryOf(activity.id)).exam).toEqual(activity.exam);
    const [published] = await events("activity.published");
    expect(published!.metadata).toMatchObject({
      classId,
      type: "EXAM",
      executionMode: "CONTROLLED",
      aiHelpAllowance: 0,
      releaseMode: "PRESENT_ONLY",
      sourceExamId: exam.id,
      durationMinutes: 30,
      inactivityLimitSeconds: 45,
      startWindowMinutes: 10,
      questionCount: 3,
      totalCents: 1000,
      scheduled: true,
    });
    expect(JSON.stringify(published!.metadata)).not.toMatch(/herança|extends|Soma|Prova de POO/i);
  });

  it("018/US2-3 aplicada sem chamada: nenhum aluno a vê e a atividade mostra \"Aguardando chamada\"", async () => {
    const activity = await applied();
    expect(activity.attendance).toEqual({ present: 0, enrolled: 3 });
    expect((await summaryOf(activity.id)).attendance).toEqual({ present: 0, enrolled: 3 });
    expect(activity.roster.map((entry) => entry.status)).toEqual(["ABSENT", "ABSENT", "ABSENT"]);
    for (const student of students) {
      expect(await sees(await studentClient(student), activity.id)).toEqual({ listed: false, onDashboard: false, detail: 404 });
    }
  });

  it("018/US2-4 018/FR-009 com 2 marcados, o não marcado recebe 404 em toda via, como uma atividade de outra turma", async () => {
    const activity = await applied();
    const [a, b, c] = students;
    expect((await markPresent(client, classId, activity.id, [a!.id, b!.id])).status).toBe(200);
    for (const present of [a!, b!]) {
      expect(await sees(await studentClient(present), activity.id)).toEqual({ listed: true, onDashboard: true, detail: 200 });
    }
    const detail = (await (await studentClient(a!)).get(`/api/me/activities/${activity.id}`)).body;
    expect(detail).toMatchObject({ type: "EXAM", executionMode: "CONTROLLED", aiHelp: { allowance: 0 } });

    const absent = await studentClient(c!);
    expect(await sees(absent, activity.id)).toEqual({ listed: false, onDashboard: false, detail: 404 });
    const questionId = activity.questions[0]!.id;
    for (const [index, res] of [
      await absent.get(`/api/me/activities/${activity.id}`),
      await startAttempt(absent, activity.id),
      await saveAnswers(absent, activity.id, [{ questionId, answer: { kind: "ALTERNATIVE", alternativeId: null }, baseRevision: 0 }]),
      await submitAttempt(absent, activity.id),
      await recordEvents(absent, activity.id, [integrityEvent("SCREEN_LEFT")]),
    ].entries()) {
      expect({ status: res.status, body: res.body }, `via ${index}`).toEqual({ status: 404, body: NOT_FOUND });
    }
    expect((await absent.get(`/api/me/activities/${randomUUID()}`)).body).toEqual(NOT_FOUND);
    const denied = (await events("student_access.denied")).filter((event) => event.actorUserId === c!.id && event.targetId === activity.id);
    expect(denied.length).toBeGreaterThan(0);
    expect(denied.every((event) => (event.metadata as { reason: string }).reason === "NOT_PRESENT")).toBe(true);
    expect(await t.prisma.activityAttempt.count({ where: { studentUserId: c!.id } })).toBe(0);

    const roster = (await client.get(`${base()}/${activity.id}`)).body as TeacherActivity;
    expect(roster.attendance).toEqual({ present: 2, enrolled: 3 });
    expect(Object.fromEntries(roster.roster.map((entry) => [entry.studentUserId, entry.status]))).toEqual({
      [a!.id]: "NOT_STARTED",
      [b!.id]: "NOT_STARTED",
      [c!.id]: "ABSENT",
    });
  });

  it("018/US2-5 018/FR-010 a prova é sempre restrita, sem ajuda e só para os presentes: o pedido não aceita modo, ajuda, liberação nem prazo", async () => {
    for (const fields of [
      { executionMode: "CONTROLLED" },
      { executionMode: "NORMAL" },
      { aiHelpAllowance: 0 },
      { aiHelpAllowance: 3 },
      { releaseMode: "ALL_ENROLLED" },
      { releaseMode: "PRESENT_ONLY" },
      { deadline: "2030-12-31T23:59:00.000Z" },
      { latePolicy: "REJECT" },
      { totalGrade: "10.00" },
    ]) {
      const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, ...fields });
      expect(res.status, JSON.stringify(fields)).toBe(400);
    }
    expect(await t.prisma.classActivity.count()).toBe(0);

    const activity = await applied();
    expect(activity).toMatchObject({ executionMode: "CONTROLLED", aiHelp: { allowance: 0 }, releaseMode: "PRESENT_ONLY" });
    const stored = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } });
    expect(stored).toMatchObject({ executionMode: "CONTROLLED", aiHelpAllowance: 0, releaseMode: "PRESENT_ONLY", sourceExamId: exam.id });
    // Nor afterwards: an edit can't change the mode, the help or a deadline either.
    for (const fields of [{ executionMode: "NORMAL" }, { aiHelpAllowance: 3 }, { deadline: "2030-12-31T23:59:00.000Z" }, { latePolicy: "REJECT" }]) {
      expect((await client.patch(`${base()}/${activity.id}`, { version: activity.version, ...fields })).status, JSON.stringify(fields)).toBe(400);
    }
  });

  it("018/US2-6 018/FR-007 a prova do banco editada depois da aplicação: o aluno vê a versão aplicada", async () => {
    const activity = await applied({ attendance: "ALL" });
    expect(activity.questions.map((question) => question.statement)).toEqual(exam.questions.map((question) => question.statement));
    const snapshot = await t.prisma.classActivityQuestion.findMany({ where: { activityId: activity.id }, orderBy: { position: "asc" } });
    expect(snapshot.map((question) => question.examDifficulty)).toEqual(["BASIC", "INTERMEDIATE", "ADVANCED"]);
    expect(snapshot.map((question) => question.value!.toFixed(2))).toEqual(["3.34", "3.33", "3.33"]);

    const edit = toExamUpdateBody(exam);
    edit.title = "Prova de POO revisada";
    edit.totalGrade = "6.00";
    edit.questions = edit.questions.map((question) => ({ ...question, statement: `${question.statement} (revisado)` }));
    expect((await client.put(`/api/exams/${exam.id}`, edit)).status).toBe(200);

    const seen = (await (await studentClient(students[0]!)).get(`/api/me/activities/${activity.id}`)).body;
    expect(seen.totalGrade).toBe("10.00");
    expect(seen.questions.map((question: { statement: string }) => question.statement)).toEqual(exam.questions.map((question) => question.statement));
    const teacherView = (await client.get(`${base()}/${activity.id}`)).body as TeacherActivity;
    expect(teacherView.questions.map((question) => question.value)).toEqual(["3.34", "3.33", "3.33"]);
  });

  it("018/FR-007 só uma prova aprovada, do próprio professor e da disciplina da turma é aplicada", async () => {
    const draft = (await postExam(client, await examBody(t, syllabus))).body as TeacherExam;
    const notApproved = await applyExam(client, classId, draft.id, { acknowledgeOutOfScope: true });
    expect(notApproved.status).toBe(409);
    expect(notApproved.body.code).toBe("EXAM_NOT_APPROVED");
    expect((await scopeCheck(draft.id)).body.code).toBe("EXAM_NOT_APPROVED");
    const archived = await client.post(`/api/exams/${exam.id}/archive`, { version: exam.version });
    expect(archived.status).toBe(200);
    expect((await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true })).body.code).toBe("EXAM_NOT_APPROVED");
    expect((await client.post(`/api/exams/${exam.id}/restore`, { version: archived.body.version })).status).toBe(200);

    // Another teacher's exam, or one that doesn't exist: the same 404.
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherClient = api(t, { cookie: await loginAs(t, other) });
    const otherExam = await approvedExam(t, otherClient, await createConfirmedSyllabus(t, other.id));
    for (const examId of [otherExam.id, randomUUID()]) {
      expect((await applyExam(client, classId, examId, { acknowledgeOutOfScope: true })).body).toEqual(NOT_FOUND);
      expect((await scopeCheck(examId)).body).toEqual(NOT_FOUND);
    }

    // An exam of another subject of the teacher.
    const otherSubject = await approvedExam(t, client, await createConfirmedSyllabus(t, teacher.id));
    const mismatch = await applyExam(client, classId, otherSubject.id, { acknowledgeOutOfScope: true });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.code).toBe("SUBJECT_MISMATCH");
    expect(await t.prisma.classActivity.count()).toBe(0);
  });

  it("018/FR-007 a mesma chave de idempotência devolve a mesma prova aplicada, sem segunda atividade nem evento", async () => {
    const idempotencyKey = randomUUID();
    const first = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, idempotencyKey });
    expect(first.status).toBe(201);
    const again = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, idempotencyKey });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await t.prisma.classActivity.count()).toBe(1);
    expect(await events("activity.published")).toHaveLength(1);
  });
});
