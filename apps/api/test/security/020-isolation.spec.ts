import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents } from "../helpers/activities";
import { createUser, loginAs } from "../helpers/factories";
import { feedbackBody, sendFeedback } from "../helpers/feedback";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 020/SC-003, 020/FR-011 (contracts/permissions.md): the feedbacks belong to the platform, read and
 * handled only by the ADMIN. No teacher — not even the teacher of the student's class — and no
 * MANAGER reaches them; a student reaches only their own routes; an ADMIN without the student role
 * cannot send. Missing capability → 403, whatever the id.
 */
describe("020/SC-003 isolamento dos feedbacks", () => {
  let t: TestApp;
  let student: Client;
  let classTeacher: Client;
  let manager: Client;
  let admin: Client;
  let feedbackId: string;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const { students } = await createClassWithStudents(t, teacher.id, { students: 1 });
    student = api(t, { cookie: await loginAs(t, students[0]!) });
    classTeacher = api(t, { cookie: await loginAs(t, teacher) });
    manager = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["MANAGER"] })) });
    admin = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["ADMIN"] })) });
    const sent = await sendFeedback(student);
    expect(sent.status).toBe(201);
    feedbackId = sent.body.id;
  });

  const adminRoutes = (client: Client, id: string) => [
    client.get("/api/feedbacks"),
    client.get("/api/feedbacks/summary"),
    client.get(`/api/feedbacks/${id}`),
    client.post(`/api/feedbacks/${id}/status`, { status: "IN_REVIEW" }),
  ];
  const studentRoutes = (client: Client) => [client.post("/api/me/feedbacks", feedbackBody()), client.get("/api/me/feedbacks")];

  it("020/SC-003 o professor da turma do aluno e o MANAGER → 403 em todas as rotas de feedback", async () => {
    for (const client of [classTeacher, manager]) {
      for (const id of [feedbackId, randomUUID()]) {
        const responses = await Promise.all([...adminRoutes(client, id), ...studentRoutes(client)]);
        expect(responses.map((res) => res.status)).toEqual(responses.map(() => 403));
      }
    }
    expect(await t.prisma.studentFeedback.count()).toBe(1);
    expect((await t.prisma.studentFeedback.findUniqueOrThrow({ where: { id: feedbackId } })).status).toBe("RECEIVED");
  });

  it("020/FR-011 o aluno → 403 nas rotas do ADMIN, inclusive para o próprio feedback", async () => {
    const responses = await Promise.all(adminRoutes(student, feedbackId));
    expect(responses.map((res) => res.status)).toEqual([403, 403, 403, 403]);
    expect(await t.prisma.studentFeedbackStatusChange.count()).toBe(0);
  });

  it("020/FR-011 o ADMIN sem papel de aluno → 403 ao enviar e ao listar os próprios", async () => {
    const responses = await Promise.all(studentRoutes(admin));
    expect(responses.map((res) => res.status)).toEqual([403, 403]);
    expect(await t.prisma.studentFeedback.count()).toBe(1);
  });
});
