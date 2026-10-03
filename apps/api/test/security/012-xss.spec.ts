import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, gradeAttempt, releaseResult, startAttempt, submitAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const SCRIPT = `<script>alert("xss")</script><img src=x onerror="alert(1)">`;

/**
 * 012/FR-035: an answer, a title and a feedback holding `<script>` and HTML are stored and served as
 * the same plain text in JSON, never escaped into or interpreted as HTML by the API (the web renders
 * them as text, `apps/web/test/student-portal-xss.test.tsx`).
 */
describe("012/FR-035 conteúdo com HTML chega como texto", () => {
  let t: TestApp;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
  });

  it("resposta, título e feedback com <script> voltam idênticos, como JSON", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const student = await createUser(t, { roles: ["STUDENT"] });
    const schoolClass = await createClass(t, teacher.id);
    await createEnrollment(t, schoolClass.id, student.id);
    const now = clock.now().getTime();
    const created = await createActivity(t, schoolClass, {
      title: SCRIPT,
      instructions: SCRIPT,
      publishAt: new Date(now - DAY),
      deadline: new Date(now + 7 * DAY),
      questions: [{ type: "OPEN_ANSWER", valueCents: 100, statement: SCRIPT }],
    });
    const id = created.activity.id;
    const client = api(t, { cookie: await loginAs(t, student) });
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });

    await startAttempt(client, id);
    await submitAttempt(client, id, [{ questionId: created.questionIds[0]!, answer: { kind: "TEXT", text: SCRIPT }, baseRevision: 0 }]);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: id } });
    await gradeAttempt(teacherClient, schoolClass.id, id, attempt.id, {
      version: 1,
      decisions: [{ questionId: created.questionIds[0]!, grade: "1.00", feedback: SCRIPT }],
      generalFeedback: SCRIPT,
    });
    await releaseResult(teacherClient, schoolClass.id, id);

    const studentView = await client.get(`/api/me/activities/${id}`);
    expect(studentView.headers["content-type"]).toMatch(/^application\/json/);
    expect([studentView.body.title, studentView.body.instructions, studentView.body.questions[0].statement]).toEqual([SCRIPT, SCRIPT, SCRIPT]);
    expect(studentView.body.attempt.answers[0].answer.text).toBe(SCRIPT);
    expect([studentView.body.result.generalFeedback, studentView.body.result.questions[0].feedback]).toEqual([SCRIPT, SCRIPT]);

    const teacherView = await teacherClient.get(`/api/classes/${schoolClass.id}/activities/${id}/attempts/${attempt.id}`);
    expect(teacherView.headers["content-type"]).toMatch(/^application\/json/);
    expect(teacherView.body.answers[0].answer.text).toBe(SCRIPT);
    expect([teacherView.body.submission.generalFeedback, teacherView.body.submission.gradings[0].feedback]).toEqual([SCRIPT, SCRIPT]);
    expect(JSON.stringify([studentView.body, teacherView.body])).not.toMatch(/&lt;|&gt;|&quot;/);
  });
});
