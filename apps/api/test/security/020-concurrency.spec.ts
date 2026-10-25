import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAs } from "../helpers/factories";
import { feedbackBody, sendFeedback } from "../helpers/feedback";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 020/SC-005, research J3, J4: the idempotency and the limit of 5 in 24 hours hold under simultaneous
 * requests — by the UNIQUE `(student_id, submission_id)` and the per-student advisory lock, never by
 * timing.
 */
describe("020/SC-005 envios simultâneos de feedback", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  const studentClient = async () => {
    const student = await createUser(t, { roles: ["STUDENT"] });
    return { student, client: api(t, { cookie: await loginAs(t, student) }) };
  };

  it("020/SC-005 10 POST simultâneos com o mesmo submissionId gravam exatamente 1 feedback e 1 evento", async () => {
    const { student, client } = await studentClient();
    const body = feedbackBody();
    const responses = await Promise.all(Array.from({ length: 10 }, () => client.post("/api/me/feedbacks", body)));
    expect(responses.map((res) => res.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
    expect(new Set(responses.map((res) => res.body.id)).size).toBe(1);
    expect(await t.prisma.studentFeedback.count({ where: { studentId: student.id } })).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "student_feedback.submitted" } })).toBe(1);
  });

  it("020/SC-005 8 POST simultâneos com ids diferentes: exatamente 5 gravados e 3 recusados com 429", async () => {
    const { student, client } = await studentClient();
    const responses = await Promise.all(Array.from({ length: 8 }, () => sendFeedback(client)));
    const statuses = responses.map((res) => res.status);
    expect(statuses.filter((status) => status === 201)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(3);
    expect(await t.prisma.studentFeedback.count({ where: { studentId: student.id } })).toBe(5);
    expect(await t.prisma.auditEvent.count({ where: { type: "student_feedback.submitted" } })).toBe(5);
    expect(await t.prisma.auditEvent.count({ where: { type: "student_feedback.rate_limited" } })).toBe(3);
  });

  it("020/SC-005 o limite de um aluno não afeta outro enviando ao mesmo tempo", async () => {
    const first = await studentClient();
    const second = await studentClient();
    const responses = await Promise.all([
      ...Array.from({ length: 7 }, () => sendFeedback(first.client)),
      ...Array.from({ length: 4 }, () => sendFeedback(second.client)),
    ]);
    expect(responses.slice(0, 7).filter((res) => res.status === 201)).toHaveLength(5);
    expect(responses.slice(7).map((res) => res.status)).toEqual([201, 201, 201, 201]);
    expect(await t.prisma.studentFeedback.count({ where: { studentId: second.student.id } })).toBe(4);
  });
});
