import type { TeacherActivity, TeacherExam } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents } from "../helpers/activities";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { FixedClock } from "../helpers/clock";
import { createExamAiApp, examGenerationRequest, requestExamGeneration } from "../helpers/exam-ai";
import { applyExam, approvedExam, decideHold, holdByHand, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

// The real time (to the minute): the DB triggers of a return compare `ends_at` with the database's `now()`.
const START = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
const RATE_LIMITED = { statusCode: 429, code: "RATE_LIMITED", message: expect.any(String) };
const DECISIONS = 3;
const GENERATIONS = 2;

/**
 * 018 contracts/configuration.md, research T17: `RATE_LIMIT_EXAM_DECISIONS_PER_MINUTE` (default 60)
 * hold decisions per teacher and minute, and `RATE_LIMIT_EXAM_GENERATIONS_PER_HOUR` (default 10) "Criar
 * prova com IA" requests per teacher and hour, both lowered here. Over the limit → 429 RATE_LIMITED
 * with `Retry-After`, nothing decided or requested; another teacher keeps their own counter. The
 * defaults are checked in `platform.spec.ts`.
 */
describe("018 limites das decisões e das gerações", () => {
  describe("decisões sobre as retenções", () => {
    let t: TestApp;
    let clock: FixedClock;

    /** A teacher with `count` started exam attempts, each on hold. */
    const teacherWithHolds = async (count: number) => {
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const client = api(t, { cookie: await loginAs(t, teacher) });
      const syllabus = await createConfirmedSyllabus(t, teacher.id);
      const { schoolClass, students } = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: count });
      const exam: TeacherExam = await approvedExam(t, client, syllabus);
      const applied = await applyExam(client, schoolClass.id, exam.id, { acknowledgeOutOfScope: true });
      expect(applied.status, JSON.stringify(applied.body)).toBe(201);
      const activity = applied.body as TeacherActivity;
      const holds: string[] = [];
      for (const student of students) {
        expect((await startExam(api(t, { cookie: await loginAs(t, student) }), activity.id)).status).toBe(200);
        const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: student.id } });
        holds.push((await holdByHand(t, attempt, clock.now())).id);
      }
      return { teacher, client, classId: schoolClass.id, activityId: activity.id, holds };
    };

    beforeAll(async () => {
      clock = new FixedClock(START);
      t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, examDecisionsPerMinute: DECISIONS } } });
    });
    afterAll(() => t.close());
    beforeEach(async () => {
      await resetDb(t.prisma);
      clock.set(START);
    });

    it(`a ${DECISIONS + 1}ª decisão no minuto → 429 com Retry-After, a retenção continua aberta e sem evento; outro professor segue`, async () => {
      const own = await teacherWithHolds(DECISIONS + 1);
      const decisions = ["cancel", "return", "cancel"] as const;
      for (const [index, decision] of decisions.entries()) {
        const res = await decideHold(own.client, own.classId, own.activityId, own.holds[index]!, decision);
        expect(res.status, JSON.stringify(res.body)).toBe(200);
      }
      const over = await decideHold(own.client, own.classId, own.activityId, own.holds[DECISIONS]!, "return");
      expect([over.status, over.body]).toEqual([429, RATE_LIMITED]);
      expect(Number(over.headers["retry-after"])).toBeGreaterThan(0);
      expect((await t.prisma.examAttemptHold.findUniqueOrThrow({ where: { id: own.holds[DECISIONS]! } })).resolution).toBeNull();
      const decided = await t.prisma.auditEvent.count({ where: { type: { in: ["exam_attempt.cancel_confirmed", "exam_attempt.returned", "exam_attempt.not_cancelled"] } } });
      expect(decided).toBe(DECISIONS);

      const other = await teacherWithHolds(1);
      expect((await decideHold(other.client, other.classId, other.activityId, other.holds[0]!, "return")).status).toBe(200);
    });
  });

  describe("\"Criar prova com IA\"", () => {
    let t: AiTestApp;

    beforeAll(async () => {
      t = await createExamAiApp({
        config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, aiAgentPerHour: 100, examGenerationsPerHour: GENERATIONS } },
      });
    });
    afterAll(() => t.close());
    beforeEach(() => resetAiDb(t));

    it(`o ${GENERATIONS + 1}º pedido na hora → 429 com Retry-After, nenhum pedido criado e a recusa auditada; outro professor segue`, async () => {
      const teacher: TestUser = await createUser(t, { roles: ["TEACHER"] });
      const client = api(t, { cookie: await loginAs(t, teacher) });
      const syllabus = await createConfirmedSyllabus(t, teacher.id);
      for (let index = 0; index < GENERATIONS; index += 1) {
        const res = await requestExamGeneration(client, examGenerationRequest(syllabus));
        expect(res.status, JSON.stringify(res.body)).toBe(202);
      }
      const over = await requestExamGeneration(client, examGenerationRequest(syllabus));
      expect([over.status, over.body]).toEqual([429, RATE_LIMITED]);
      expect(Number(over.headers["retry-after"])).toBeGreaterThan(0);
      expect(await t.prisma.examGenerationRequest.count({ where: { teacherId: teacher.id } })).toBe(GENERATIONS);
      const refused = await t.prisma.auditEvent.findMany({ where: { type: "ai_execution.rate_limited", actorUserId: teacher.id } });
      expect(refused.map((event) => event.metadata)).toEqual([{ scope: "exam-ai" }]);

      const other = await createUser(t, { roles: ["TEACHER"] });
      const otherClient = api(t, { cookie: await loginAs(t, other) });
      expect((await requestExamGeneration(otherClient, examGenerationRequest(await createConfirmedSyllabus(t, other.id)))).status).toBe(202);
    });
  });
});
