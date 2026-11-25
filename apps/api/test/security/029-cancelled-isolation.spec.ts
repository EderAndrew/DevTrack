import type { StudentHistoryPage } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { cancelByHand, createActivity, createAttemptRow } from "../helpers/activities";
import { DAY, FixedClock, HOUR } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 029/US2 security (029/SC-002, SC-003; research HC2, HC3): a cancelled work or exam reaches only the student's own
 * Histórico — never another student's, an ended enrollment's or another subject's (`classId`) —, never with a grade or
 * feedback even when released before the cancellation, and every other student route of it stays `404` with
 * `student_access.denied` (`CANCELLED`), as before 029.
 */

type Client = ReturnType<typeof api>;

const START = "2026-11-24T12:00:00.000Z";
const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
const FEEDBACK = "FEEDBACK-CANCELADA-029";
/** A grade or feedback anywhere (the 026 pattern); `totalGrade` of the activity is public. */
const RESULT = new RegExp(`"grade"|"result":\\{|${FEEDBACK}|generalFeedback`);

describe("029/US2 canceladas só no Histórico do próprio aluno, sem nota", () => {
  let t: TestApp;
  let clock: FixedClock;
  let work: WorkFixture;
  let student: TestUser;
  let other: TestUser;
  let own: SchoolClass;
  let second: SchoolClass;
  let foreign: SchoolClass;
  let ended: SchoolClass;
  let client: Client;
  const ids = {} as Record<"own" | "second" | "foreign" | "ended", string>;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /** A work of `schoolClass` delivered by `studentId`, graded and released, then cancelled. */
  const cancelledDelivery = async (schoolClass: SchoolClass, studentId: string, title: string) => {
    const { activity } = await createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      title,
      publishAt: at(-3 * DAY),
      deadline: at(2 * DAY),
      sourceWorkId: work.id,
      sourceSubjectId: work.subjectId,
      resultReleasedAt: at(-2 * HOUR),
    });
    await createAttemptRow(t, activity.id, studentId, {
      startedAt: at(-DAY - HOUR),
      submission: { submittedAt: at(-DAY), gradeCents: 77, generalFeedback: FEEDBACK },
    });
    await cancelByHand(t, activity.id, at(-HOUR));
    return activity.id;
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    work = await createWork(t, teacher.id, { syllabus });
    student = await createUser(t, { roles: ["STUDENT"] });
    other = await createUser(t, { roles: ["STUDENT"] });
    own = await createClass(t, teacher.id, { subjectId: syllabus.subject.id });
    second = await createClass(t, teacher.id, { subjectId: syllabus.subject.id });
    foreign = await createClass(t, teacher.id, { subjectId: syllabus.subject.id });
    ended = await createClass(t, teacher.id, { subjectId: syllabus.subject.id });
    await createEnrollment(t, own.id, student.id);
    await createEnrollment(t, second.id, student.id);
    await createEnrollment(t, foreign.id, other.id);
    const endedEnrollment = await createEnrollment(t, ended.id, student.id);
    ids.own = await cancelledDelivery(own, student.id, "Cancelada própria");
    ids.second = await cancelledDelivery(second, student.id, "Cancelada de outra matéria");
    ids.foreign = await cancelledDelivery(foreign, other.id, "CANCELADA-ALHEIA-029");
    ids.ended = await cancelledDelivery(ended, student.id, "CANCELADA-ENCERRADA-029");
    await t.prisma.enrollment.update({ where: { id: endedEnrollment.id }, data: { status: "REMOVED", removedAt: clock.now(), removalReason: "MANAGER" } });
    client = api(t, { cookie: await loginAs(t, student) });
  });

  it("029/SC-003 a cancelada de outro aluno, de matrícula encerrada e de outra matéria nunca aparece", async () => {
    const all = (await client.get("/api/me/history")).body as StudentHistoryPage;
    expect(all.items.map((item) => item.id).sort()).toEqual([ids.own, ids.second].sort());
    expect(JSON.stringify(all)).not.toMatch(/CANCELADA-ALHEIA|CANCELADA-ENCERRADA/);

    const narrowed = (await client.get(`/api/me/history?classId=${own.id}&tab=CANCELLED`)).body as StudentHistoryPage;
    expect(narrowed.items.map((item) => item.id)).toEqual([ids.own]);
    expect(narrowed.totals.cancelled).toBe(1);
    expect(narrowed.tabCounts.cancelled).toBe(1);

    for (const classId of [foreign.id, ended.id]) {
      const res = await client.get(`/api/me/history?classId=${classId}&tab=CANCELLED`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    }
  });

  it("029/US2-4 as outras rotas da cancelada continuam 404 com student_access.denied (CANCELLED)", async () => {
    const calls = [
      ["/me/activities/:activityId", () => client.get(`/api/me/activities/${ids.own}`)],
      ["/me/activities/:activityId/attempt", () => client.post(`/api/me/activities/${ids.own}/attempt`, {})],
      ["/me/activities/:activityId/attempts/:number", () => client.get(`/api/me/activities/${ids.own}/attempts/1`)],
      ["/me/activities/:activityId/attempt/submit", () => client.post(`/api/me/activities/${ids.own}/attempt/submit`, { answers: [] })],
    ] as const;
    for (const [route, call] of calls) {
      const res = await call();
      expect({ route, status: res.status, body: res.body }).toEqual({ route, status: 404, body: NOT_FOUND });
      const [last] = await t.prisma.auditEvent.findMany({ where: { type: "student_access.denied" }, orderBy: { id: "desc" }, take: 1 });
      expect(last).toMatchObject({ actorUserId: student.id, targetId: ids.own, metadata: { route, reason: "CANCELLED" } });
    }
    // Nor in "Minhas atividades" or the Painel.
    for (const path of ["/api/me/activities", "/api/me/dashboard"]) {
      const res = await client.get(path);
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(ids.own);
    }
  });

  it("029/SC-002 nenhuma combinação de aba, busca e matéria traz nota ou feedback de uma cancelada", async () => {
    for (const classId of ["", own.id, second.id]) {
      for (const tab of ["", "CANCELLED", "GRADED", "AWAITING", "MISSED"]) {
        for (const q of ["", "cancelada"]) {
          const params = new URLSearchParams({ ...(classId ? { classId } : {}), ...(tab ? { tab } : {}), ...(q ? { q } : {}) });
          const res = await client.get(`/api/me/history?${params.toString()}`);
          expect(res.status, params.toString()).toBe(200);
          expect(JSON.stringify(res.body), params.toString()).not.toMatch(RESULT);
          const body = res.body as StudentHistoryPage;
          expect(body.totals, params.toString()).toMatchObject({ delivered: 0, awaiting: 0, graded: 0 });
        }
      }
    }
  });
});
