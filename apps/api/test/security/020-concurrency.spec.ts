import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAs } from "../helpers/factories";
import { feedbackBody, sendFeedback } from "../helpers/feedback";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 020/SC-005, research J3, J4: the idempotency and the limit of 5 in 24 hours hold under simultaneous
 * requests — by the UNIQUE `(student_id, submission_id)` and the per-student advisory lock, never by
 * timing; two ADMINs changing one feedback serialise on its row lock (020/FR-007, research J5).
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

  const adminClients = async (count: number) =>
    Promise.all(Array.from({ length: count }, async () => api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) })));

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
  it("020/FR-007 dois ADMINs pedem a mesma situação ao mesmo tempo: uma aplicada, um 409, uma linha de histórico", async () => {
    const { client } = await studentClient();
    const id = (await sendFeedback(client)).body.id as string;
    const admins = await adminClients(2);
    for (let round = 0; round < 5; round += 1) {
      const to = round % 2 === 0 ? "IN_REVIEW" : "RESOLVED";
      const responses = await Promise.all(admins.map((admin) => admin.post(`/api/feedbacks/${id}/status`, { status: to })));
      expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
      expect(await t.prisma.studentFeedbackStatusChange.count({ where: { feedbackId: id } })).toBe(round + 1);
    }
    expect(await t.prisma.auditEvent.count({ where: { type: "student_feedback.status_changed" } })).toBe(5);
  });

  it("020/FR-007 dois ADMINs pedem situações diferentes válidas a partir de RECEIVED: as duas aplicadas em série", async () => {
    const { client } = await studentClient();
    const id = (await sendFeedback(client)).body.id as string;
    const admins = await adminClients(2);
    const responses = await Promise.all([
      admins[0]!.post(`/api/feedbacks/${id}/status`, { status: "IN_REVIEW" }),
      admins[1]!.post(`/api/feedbacks/${id}/status`, { status: "RESOLVED" }),
    ]);
    expect(responses.map((res) => res.status)).toEqual([200, 200]);
    const history = await t.prisma.studentFeedbackStatusChange.findMany({ where: { feedbackId: id } });
    expect(history).toHaveLength(2);
    const first = history.find((change) => change.fromStatus === "RECEIVED")!;
    const second = history.find((change) => change !== first)!;
    expect(second.fromStatus).toBe(first.toStatus);
    const row = await t.prisma.studentFeedback.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe(second.toStatus);
  });
});
