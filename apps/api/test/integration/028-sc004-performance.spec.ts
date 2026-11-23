import { randomUUID } from "node:crypto";
import type { StudentHistoryPage } from "@repo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createAttemptRow } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 028/SC-004 — a search or a change of tab or matéria answers within 2 s with 500 deliveries in the student's history.
 * The activities, questions, alternatives, attempts and submissions go in by batch (`createMany`) in one transaction
 * per kind, so the deferred snapshot triggers check them at commit as the routes would. The time is the route's, in
 * the test process (no network), so it is an upper bound of the server's share of the 2 s.
 */

const DELIVERIES = 500;
const LIMIT_MS = 2_000;
const START = new Date(Math.floor(Date.now() / MINUTE) * MINUTE).toISOString();

async function timed<T>(run: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const started = performance.now();
  const value = await run();
  return { value, ms: performance.now() - started };
}

describe("028/SC-004 desempenho do Histórico com 500 entregas", () => {
  let t: TestApp;
  let clock: FixedClock;
  let classA: SchoolClass;
  let classB: SchoolClass;
  let student: TestUser;
  let client: ReturnType<typeof api>;

  /** `count` delivered works of `schoolClass`, every other one released; titles "Prova N" or "Trabalho N". */
  const seed = async (schoolClass: SchoolClass, work: WorkFixture, count: number, offset: number) => {
    const now = clock.now().getTime();
    const activities = Array.from({ length: count }, (_, index) => ({
      id: randomUUID(),
      classId: schoolClass.id,
      teacherId: schoolClass.teacherId,
      type: "ASSIGNMENT" as const,
      status: "ACTIVE" as const,
      title: `${index % 3 === 0 ? "Prova" : "Trabalho"} ${offset + index}`,
      totalGrade: "1.00",
      questionCount: 1,
      publishAt: new Date(now - 30 * DAY),
      deadline: new Date(now + 7 * DAY),
      latePolicy: "REJECT" as const,
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
      ...(index % 2 === 0 ? { resultReleasedAt: new Date(now - MINUTE), resultReleasedById: schoolClass.teacherId } : {}),
      idempotencyKey: randomUUID(),
    }));
    const questions = activities.map((activity) => ({
      id: randomUUID(),
      activityId: activity.id,
      position: 0,
      type: "MULTIPLE_CHOICE" as const,
      gradingStrategy: "EXACT_MATCH" as const,
      value: "1.00",
      statement: "Enunciado 1",
    }));
    await t.prisma.$transaction(async (tx) => {
      await tx.classActivity.createMany({ data: activities });
      await tx.classActivityQuestion.createMany({ data: questions });
      await tx.classActivityAlternative.createMany({
        data: questions.flatMap((question) =>
          ["A", "B", "C"].map((text, position) => ({ questionId: question.id, position, text, isCorrect: position === 0 })),
        ),
      });
    });
    for (const [index, activity] of activities.entries()) {
      const submittedAt = new Date(now - (offset + index + 1) * MINUTE);
      await createAttemptRow(t, activity.id, student.id, {
        startedAt: new Date(submittedAt.getTime() - HOUR),
        submission: { submittedAt, gradeCents: 70 },
      });
    }
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
    await resetDb(t.prisma);
    const teacherA = await createUser(t, { roles: ["TEACHER"] });
    const teacherB = await createUser(t, { roles: ["TEACHER"] });
    const syllabusA = await createConfirmedSyllabus(t, teacherA.id);
    const syllabusB = await createConfirmedSyllabus(t, teacherB.id);
    const workA = await createWork(t, teacherA.id, { syllabus: syllabusA });
    const workB = await createWork(t, teacherB.id, { syllabus: syllabusB });
    classA = await createClass(t, teacherA.id, { subjectId: syllabusA.subject.id });
    classB = await createClass(t, teacherB.id, { cohortId: classA.cohortId, subjectId: syllabusB.subject.id });
    student = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, classA.id, student.id);
    client = api(t, { cookie: await loginAs(t, student) });
    await seed(classA, workA, DELIVERIES / 2, 0);
    await seed(classB, workB, DELIVERIES / 2, DELIVERIES / 2);
  }, 180_000);
  afterAll(() => t.close());

  const history = async (query: string) => {
    const { value: res, ms } = await timed(() => client.get(`/api/me/history${query}`));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return { body: res.body as StudentHistoryPage, ms };
  };

  it("028/SC-004 sem filtro, por aba, por busca, por matéria e combinados: cada resposta em menos de 2 s", async () => {
    const first = await history("");
    expect(first.body.totals).toEqual({ delivered: DELIVERIES, awaiting: DELIVERIES / 2, graded: DELIVERIES / 2 });
    expect(first.ms).toBeLessThan(LIMIT_MS);

    const cases = [
      "?tab=GRADED",
      "?tab=AWAITING",
      "?q=prova",
      `?classId=${classA.id}`,
      `?classId=${classB.id}&tab=GRADED`,
      `?classId=${classA.id}&tab=AWAITING&q=trabalho`,
      `?q=${encodeURIComponent("inexistente")}`,
    ];
    for (const query of cases) {
      const { body, ms } = await history(query);
      expect(ms, query).toBeLessThan(LIMIT_MS);
      expect(body.items.length).toBeLessThanOrEqual(body.total);
    }

    const graded = await history("?tab=GRADED");
    expect(graded.body.total).toBe(DELIVERIES / 2);
    const nextPage = await history(`?tab=GRADED&cursor=${encodeURIComponent(graded.body.nextCursor!)}`);
    expect(nextPage.ms).toBeLessThan(LIMIT_MS);
    expect(nextPage.body.items[0]!.id).not.toBe(graded.body.items[0]!.id);
  }, 60_000);
});
