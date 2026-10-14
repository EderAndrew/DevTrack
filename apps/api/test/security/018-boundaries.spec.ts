import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { endpoints, type ExamQuestionEdit, type TeacherActivity, type TeacherExam } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createClassWithStudents, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { API_ROOT } from "../helpers/env";
import { applyExam, approvedExam, decideHold, examBody, holdByHand, postExam, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus } from "../helpers/works";

const SECOND = 1000;
// The real time (to the minute): the DB triggers of a return compare `ends_at` with the database's `now()`.
const START = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
const VALIDATION = { statusCode: 400, code: "VALIDATION_ERROR", message: expect.any(String) };
type Client = ReturnType<typeof api>;

/**
 * 018 contracts/http-api.md: bodies are strict and the fields the server controls are refused (400) on
 * every new and changed route; an exam has 1–20 questions; an applied exam takes 1–120 min, 30–60 s of
 * inactivity and a start window of 0–60 min, and never the work's `deadline`, `latePolicy`,
 * `executionMode`, `aiHelpAllowance` or `releaseMode`; `idleSeconds` (30–60) only with INACTIVITY. A
 * refused body writes nothing. 018/FR-034: no route beyond the contract, no help, exit or second
 * attempt in an exam; 018/SC-012: the Trabalho and the Exercício keep their 012–016 rules.
 */
describe("018 fronteiras da prova", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let syllabus: ConfirmedSyllabus;
  let exam: TeacherExam;

  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const applied = async (overrides: Parameters<typeof applyExam>[3] = {}) => {
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  /** The first student, started on a new exam. */
  const started = async () => {
    const activity = await applied();
    const student = await studentClient(students[0]!);
    expect((await startExam(student, activity.id)).status).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: students[0]!.id } });
    return { activity, student, attempt };
  };
  const openQuestion = (topicId: string): ExamQuestionEdit => ({
    type: "OPEN_ANSWER",
    statement: "Explique herança.",
    expectedAnswer: "Reuso por extensão.",
    difficulty: "BASIC",
    topicIds: [topicId],
  });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    classId = created.schoolClass.id;
    students = created.students;
    exam = await approvedExam(t, client, syllabus);
  });

  describe("Banco de Provas", () => {
    it("campos do servidor na prova e na questão → 400, nada gravado", async () => {
      const body = await examBody(t, syllabus);
      const invalid: Record<string, unknown>[] = [
        { ...body, origin: "MANUAL" },
        { ...body, status: "APPROVED" },
        { ...body, reviewedAt: new Date().toISOString() },
        { ...body, teacherId: teacher.id },
        { ...body, version: 1 },
        { ...body, questions: [{ ...body.questions[0]!, value: "10.00" }] },
        { ...body, questions: [{ ...body.questions[0]!, gradingStrategy: "EXACT_MATCH" }] },
        { ...body, questions: [{ ...body.questions[0]!, topicIds: [] }] },
        { ...body, questions: [{ ...body.questions[0]!, difficulty: "EASY" }] },
        { ...body, topicIds: [] },
      ];
      const before = await t.prisma.exam.count();
      for (const payload of invalid) {
        const res = await client.post("/api/exams", payload);
        expect([res.status, res.body], JSON.stringify(Object.keys(payload))).toEqual([400, VALIDATION]);
      }
      expect(await t.prisma.exam.count()).toBe(before);
    });

    it("0 e 21 questões → 400; 1 e 20 → 201", async () => {
      const topicId = syllabus.itemIds[0]!;
      for (const count of [0, 21]) {
        const res = await postExam(client, await examBody(t, syllabus, { questions: Array.from({ length: count }, () => openQuestion(topicId)) }));
        expect([res.status, res.body], `${count}`).toEqual([400, VALIDATION]);
      }
      for (const count of [1, 20]) {
        const res = await postExam(client, await examBody(t, syllabus, { questions: Array.from({ length: count }, () => openQuestion(topicId)) }));
        expect([res.status, res.body.questions?.length], `${count}`).toEqual([201, count]);
      }
    });
  });

  describe("aplicação", () => {
    it("duração 0/121, inatividade 29/61 e janela -1/61 → 400; 1/120, 30/60 e 0/60 cabem", async () => {
      for (const fields of [
        { durationMinutes: 0 },
        { durationMinutes: 121 },
        { inactivityLimitSeconds: 29 },
        { inactivityLimitSeconds: 61 },
        { startWindowMinutes: -1 },
        { startWindowMinutes: 61 },
      ]) {
        const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, attendance: "NONE", ...fields });
        expect([res.status, res.body], JSON.stringify(fields)).toEqual([400, VALIDATION]);
      }
      expect(await t.prisma.classActivity.count()).toBe(0);
      const low = await applied({ durationMinutes: 1, inactivityLimitSeconds: 30, startWindowMinutes: 0, attendance: "NONE" });
      const high = await applied({ durationMinutes: 120, inactivityLimitSeconds: 60, startWindowMinutes: 60, attendance: "NONE" });
      expect([low.exam, high.exam]).toEqual([
        expect.objectContaining({ durationMinutes: 1, inactivityLimitSeconds: 30, startWindowMinutes: 0 }),
        expect.objectContaining({ durationMinutes: 120, inactivityLimitSeconds: 60, startWindowMinutes: 60 }),
      ]);
    });

    it("018/FR-034 prazo, política de atraso, modo, ajuda e liberação no corpo da prova → 400 (a prova é sempre restrita, sem ajuda e só para os presentes)", async () => {
      for (const fields of [
        { deadline: new Date(clock.now().getTime() + DAY).toISOString() },
        { latePolicy: "REJECT" },
        { executionMode: "NORMAL" },
        { executionMode: "CONTROLLED" },
        { aiHelpAllowance: 3 },
        { releaseMode: "ALL_ENROLLED" },
        { endsAt: new Date().toISOString() },
      ]) {
        const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, attendance: "NONE", ...fields });
        expect([res.status, res.body], JSON.stringify(fields)).toEqual([400, VALIDATION]);
      }
      expect(await t.prisma.classActivity.count()).toBe(0);
    });
  });

  describe("tentativa", () => {
    it("idleSeconds 29/61, sem INACTIVITY ou faltando → 400, nada gravado; 30 e 60 aceitos", async () => {
      const { activity, student, attempt } = await started();
      for (const event of [
        integrityEvent("INACTIVITY", { idleSeconds: 29 }),
        integrityEvent("INACTIVITY", { idleSeconds: 61 }),
        integrityEvent("INACTIVITY", { idleSeconds: 45.5 }),
        integrityEvent("INACTIVITY"),
        integrityEvent("SCREEN_LEFT", { idleSeconds: 45 }),
      ]) {
        const res = await recordEvents(student, activity.id, [event]);
        expect([res.status, res.body], JSON.stringify(event)).toEqual([400, VALIDATION]);
      }
      expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId: attempt.id } })).toBe(0);
      for (const idleSeconds of [30, 60]) {
        const res = await recordEvents(student, activity.id, [integrityEvent("INACTIVITY", { idleSeconds })]);
        expect([res.status, res.body.exam?.held], `${idleSeconds}`).toEqual([200, false]);
        clock.advance(5 * SECOND);
      }
      const stored = await t.prisma.attemptIntegrityEvent.findMany({ where: { attemptId: attempt.id }, orderBy: { recordedAt: "asc" } });
      expect(stored.map((event) => event.idleSeconds)).toEqual([30, 60]);
    });

    it("campos do servidor no início, nos eventos, no salvamento, na entrega e nas decisões → 400, nada muda", async () => {
      const activity = await applied();
      const student = await studentClient(students[0]!);
      const startPath = `/api/me/activities/${activity.id}/attempt`;
      for (const body of [
        { acceptRules: false },
        { acceptRules: true, startedAt: new Date().toISOString() },
        { acceptRules: true, endsAt: new Date().toISOString() },
        { acceptRules: true, examStatus: "IN_PROGRESS" },
      ]) {
        expect((await student.post(startPath, body)).body, JSON.stringify(body)).toEqual(VALIDATION);
      }
      expect(await t.prisma.activityAttempt.count()).toBe(0);
      expect((await startExam(student, activity.id)).status).toBe(200);

      const event = integrityEvent("SCREEN_LEFT");
      for (const extra of [{ recordedAt: new Date().toISOString() }, { ordinal: 1 }, { occurrenceCount: 0 }, { serverNow: new Date().toISOString() }]) {
        const res = await student.post(`${startPath}/events`, { events: [{ ...event, ...extra }] });
        expect(res.body, JSON.stringify(extra)).toEqual(VALIDATION);
      }
      for (const extra of [{ occurrenceCount: 0 }, { endsAt: new Date().toISOString() }]) {
        expect((await student.post(`${startPath}/events`, { events: [event], ...extra })).body, JSON.stringify(extra)).toEqual(VALIDATION);
      }
      expect(await t.prisma.attemptIntegrityEvent.count()).toBe(0);

      for (const extra of [{ endsAt: new Date().toISOString() }, { endReason: "STUDENT_SUBMITTED" }, { grade: "10.00" }]) {
        expect((await student.put(`${startPath}/answers`, { answers: [], ...extra })).body, JSON.stringify(extra)).toEqual(VALIDATION);
        expect((await student.post(`${startPath}/submit`, { answers: [], ...extra })).body, JSON.stringify(extra)).toEqual(VALIDATION);
      }
      expect(await t.prisma.activitySubmission.count()).toBe(0);

      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } });
      const hold = await holdByHand(t, attempt, clock.now());
      const holdPath = `/api/classes/${classId}/activities/${activity.id}/exam-holds/${hold.id}`;
      for (const decision of ["cancel", "return", "keep"]) {
        for (const body of [{ resolution: "RETURNED" }, { resolvedAt: new Date().toISOString() }, { endReason: "CANCELLED" }]) {
          expect((await client.post(`${holdPath}/${decision}`, body)).body, `${decision} ${JSON.stringify(body)}`).toEqual(VALIDATION);
        }
      }
      expect((await t.prisma.examAttemptHold.findUniqueOrThrow({ where: { id: hold.id } })).resolution).toBeNull();
      const decided = await decideHold(client, classId, activity.id, hold.id, "return");
      expect(decided.status, JSON.stringify(decided.body)).toBe(200);
    });
  });

  describe("018/FR-034 fora do escopo", () => {
    it("018/FR-034 nenhuma rota de prova fora do catálogo de contracts/http-api.md", () => {
      const contract = readFileSync(resolve(API_ROOT, "../../specs/018-controlled-exams/contracts/http-api.md"), "utf8");
      const documented = [...contract.matchAll(/^\| `(GET|POST|PUT|PATCH|DELETE) ([^`]+)` \|/gm)].map(([, method, path]) => `${method} ${path}`).sort();
      expect(documented).toHaveLength(16);
      const catalogued = Object.values(endpoints)
        .filter((entry) => /\/exams?(-|\/|$)/.test(entry.path))
        .map((entry) => `${entry.method} ${entry.path}`)
        .sort();
      expect(catalogued).toEqual(documented);
    });

    it("018/FR-034 uma tentativa por aluno, sem ajuda da IA nem \"Sair da sala\", e nenhuma execução de IA na prova", async () => {
      const { activity, student } = await started();
      const again = await startExam(student, activity.id);
      expect(again.status).toBe(200);
      expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(1);
      const help = await student.post(`/api/me/activities/${activity.id}/attempt/help`, { idempotencyKey: randomUUID(), questionId: activity.questions[0]!.id, question: "Me ajude" });
      expect([help.status, help.body.code]).toEqual([409, "HELP_NOT_ENABLED"]);
      const exit = await student.post(`/api/me/activities/${activity.id}/attempt/pause`, { reason: "WATER" });
      expect([exit.status, exit.body.code]).toEqual([409, "EXIT_NOT_ALLOWED"]);
      expect(await t.prisma.workHelpRequest.count()).toBe(0);
      expect(await t.prisma.attemptPause.count()).toBe(0);
      expect(await t.prisma.aiExecution.count()).toBe(0);
    });

    it("018/SC-012 o Trabalho e o Exercício não aceitam os campos da prova e seguem sem contagem de ocorrências nem retenção", async () => {
      const work = { idempotencyKey: randomUUID(), source: { type: "ASSIGNMENT", workId: randomUUID() }, title: "Trabalho", instructions: null, publishAt: null, deadline: new Date(clock.now().getTime() + DAY).toISOString(), latePolicy: "REJECT", acknowledgeOutOfScope: false };
      for (const fields of [{ durationMinutes: 30 }, { inactivityLimitSeconds: 60 }, { startWindowMinutes: 15 }]) {
        const res = await client.post(`/api/classes/${classId}/activities`, { ...work, ...fields });
        expect([res.status, res.body], JSON.stringify(fields)).toEqual([400, VALIDATION]);
      }

      // A CONTROLLED work: four exits are facts for the teacher, never warnings or a hold (015 unchanged).
      const controlled = await createActivity(t, { id: classId, teacherId: teacher.id }, {
        type: "ASSIGNMENT",
        executionMode: "CONTROLLED",
        publishAt: new Date(clock.now().getTime() - DAY),
        deadline: new Date(clock.now().getTime() + DAY),
        questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
      });
      const student = await studentClient(students[0]!);
      expect((await startAttempt(student, controlled.activity.id)).status).toBe(200);
      for (let index = 0; index < 4; index += 1) {
        const res = await recordEvents(student, controlled.activity.id, [integrityEvent("SCREEN_LEFT")]);
        expect([res.status, res.body.exam]).toEqual([200, null]);
        clock.advance(5 * SECOND);
      }
      const answer = [{ questionId: controlled.questionIds[0]!, answer: { kind: "TEXT" as const, text: "Resposta" }, baseRevision: 0 }];
      expect((await saveAnswers(student, controlled.activity.id, answer)).status).toBe(200);
      expect((await submitAttempt(student, controlled.activity.id)).status).toBe(200);

      // An Exercício starts with the 013 empty body and has no exam data.
      const exercise = await createActivity(t, { id: classId, teacherId: teacher.id }, { type: "EXERCISE", publishAt: new Date(clock.now().getTime() - DAY), questions: [{ type: "OPEN_ANSWER" }] });
      expect((await startAttempt(student, exercise.activity.id)).status).toBe(200);
      expect((await student.get(`/api/me/activities/${exercise.activity.id}`)).body.exam).toBeNull();
      expect(await t.prisma.examOccurrence.count()).toBe(0);
      expect(await t.prisma.examAttemptHold.count()).toBe(0);
    });
  });
});
