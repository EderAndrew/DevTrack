import { randomUUID } from "node:crypto";
import { StudentFeedbackSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents } from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { feedbackBody, sendFeedback } from "../helpers/feedback";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** 020/US1 — the student sends a feedback (contracts/http-api.md, research J2, J3, J4, J9). */
describe("020/US1 aluno envia um feedback", () => {
  let t: TestApp;
  let clock: FixedClock;
  let student: TestUser;
  let client: ReturnType<typeof api>;

  beforeAll(async () => {
    clock = new FixedClock("2026-10-25T12:00:00.000Z");
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set("2026-10-25T12:00:00.000Z");
    student = await createUser(t, { roles: ["STUDENT"], name: "Aluna do Feedback" });
    client = api(t, { cookie: await loginAs(t, student) });
  });

  const stored = () => t.prisma.studentFeedback.findMany({ orderBy: { createdAt: "asc" } });

  it("020/US1-1 o feedback é gravado RECEIVED com o aluno da sessão, o momento do servidor e a tela", async () => {
    const body = feedbackBody({ category: "SUGGESTION", message: "  Seria bom um modo escuro no portal.  ", originPath: "/minhas-atividades/abc-1" });
    const res = await client.post("/api/me/feedbacks", body);
    expect(res.status).toBe(201);
    expect(StudentFeedbackSchema.parse(res.body)).toEqual({
      id: expect.any(String),
      category: "SUGGESTION",
      message: "Seria bom um modo escuro no portal.",
      status: "RECEIVED",
      createdAt: "2026-10-25T12:00:00.000Z",
    });
    const [row] = await stored();
    expect(row).toMatchObject({
      id: res.body.id,
      studentId: student.id,
      submissionId: body.submissionId,
      category: "SUGGESTION",
      message: "Seria bom um modo escuro no portal.",
      originPath: "/minhas-atividades/abc-1",
      status: "RECEIVED",
    });
    expect(row!.createdAt.toISOString()).toBe("2026-10-25T12:00:00.000Z");
    expect(row!.statusChangedAt.toISOString()).toBe("2026-10-25T12:00:00.000Z");
    const events = await t.prisma.auditEvent.findMany({ where: { type: "student_feedback.submitted" } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actorUserId: student.id, targetType: "STUDENT_FEEDBACK", targetId: res.body.id, metadata: { category: "SUGGESTION" } });
  });

  it("020/US1-1 um aluno removido de todas as turmas também envia (spec Edge Cases)", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const { students } = await createClassWithStudents(t, teacher.id, { students: 1 });
    const removed = students[0]!;
    await t.prisma.enrollment.updateMany({ where: { studentUserId: removed.id }, data: { status: "REMOVED", removedAt: new Date(), removedById: teacher.id } });
    const res = await sendFeedback(api(t, { cookie: await loginAs(t, removed) }));
    expect(res.status).toBe(201);
    expect(await t.prisma.studentFeedback.count({ where: { studentId: removed.id } })).toBe(1);
  });

  it("020/US1-2 sem categoria, com 9 ou 2 001 code points, só espaços ou campo extra → 400 e nada gravado", async () => {
    const { category: _category, ...withoutCategory } = feedbackBody();
    const invalid: Record<string, unknown>[] = [
      withoutCategory,
      feedbackBody({ category: "BUG" }),
      feedbackBody({ message: "😀".repeat(9) }),
      feedbackBody({ message: "ç".repeat(2001) }),
      feedbackBody({ message: " ".repeat(40) }),
      feedbackBody({ message: "texto com \u0000 no meio" }),
      feedbackBody({ extra: true }),
    ];
    for (const body of invalid) {
      const res = await client.post("/api/me/feedbacks", body);
      expect(res.status, JSON.stringify(body).slice(0, 80)).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    }
    expect(await t.prisma.studentFeedback.count()).toBe(0);
    expect(await t.prisma.auditEvent.count({ where: { type: { startsWith: "student_feedback." } } })).toBe(0);
  });

  it("020/US1-3 o mesmo submissionId duas vezes grava um só feedback: 201 e depois 200 com o mesmo", async () => {
    const body = feedbackBody();
    const first = await client.post("/api/me/feedbacks", body);
    expect(first.status).toBe(201);
    clock.advance(MINUTE);
    const again = await client.post("/api/me/feedbacks", body);
    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    // A different body under the same id returns the stored feedback unchanged (research J3).
    const changed = await client.post("/api/me/feedbacks", { ...body, category: "PRAISE", message: "Outro texto, outra ideia." });
    expect(changed.status).toBe(200);
    expect(changed.body).toEqual(first.body);
    expect(await t.prisma.studentFeedback.count()).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "student_feedback.submitted" } })).toBe(1);
  });

  it("020/US1-3 o mesmo submissionId de outro aluno é outro feedback", async () => {
    const body = feedbackBody();
    expect((await client.post("/api/me/feedbacks", body)).status).toBe(201);
    const other = await createUser(t, { roles: ["STUDENT"] });
    expect((await api(t, { cookie: await loginAs(t, other) }).post("/api/me/feedbacks", body)).status).toBe(201);
    expect(await t.prisma.studentFeedback.count()).toBe(2);
  });

  it("020/US1-4 5 envios em 24 h são aceitos; o 6º → 429 com Retry-After até o mais antigo fazer 24 h", async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await sendFeedback(client)).status).toBe(201);
      clock.advance(HOUR);
    }
    // Now: 5 h after the first.
    const refused = await sendFeedback(client);
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe("RATE_LIMITED");
    expect(Number(refused.headers["retry-after"])).toBe(19 * 3600);
    expect(await t.prisma.studentFeedback.count()).toBe(5);
    const limited = await t.prisma.auditEvent.findMany({ where: { type: "student_feedback.rate_limited" } });
    expect(limited).toHaveLength(1);
    expect(limited[0]).toMatchObject({ actorUserId: student.id, targetType: null, metadata: { scope: "student-feedback" } });

    // A known submissionId still answers its feedback, without counting.
    const first = await t.prisma.studentFeedback.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    expect((await sendFeedback(client, { submissionId: first.submissionId })).status).toBe(200);

    // One second before the oldest turns 24 h old: still refused, for 1 s.
    clock.set(new Date(first.createdAt.getTime() + DAY - 1000));
    const almost = await sendFeedback(client);
    expect(almost.status).toBe(429);
    expect(almost.headers["retry-after"]).toBe("1");
    clock.set(new Date(first.createdAt.getTime() + DAY));
    expect((await sendFeedback(client)).status).toBe(201);
    expect(await t.prisma.studentFeedback.count()).toBe(6);
  });

  it("020/US1-4 o limite é de cada aluno", async () => {
    for (let i = 0; i < 5; i += 1) expect((await sendFeedback(client)).status).toBe(201);
    expect((await sendFeedback(client)).status).toBe(429);
    const other = await createUser(t, { roles: ["STUDENT"] });
    expect((await sendFeedback(api(t, { cookie: await loginAs(t, other) }))).status).toBe(201);
  });

  it("020/FR-002 a tela de origem: caminho com consulta ou inválido → 400; sem ela → nula; aluno e situação nunca vêm do corpo", async () => {
    for (const originPath of ["/convite?token=abc", "/painel#x", "painel", "//evil.example/x", "/a/../b", `/${"a".repeat(200)}`]) {
      expect((await sendFeedback(client, { originPath })).status, originPath).toBe(400);
    }
    expect((await sendFeedback(client, { studentId: randomUUID() })).status).toBe(400);
    expect((await sendFeedback(client, { status: "RESOLVED" })).status).toBe(400);
    expect(await t.prisma.studentFeedback.count()).toBe(0);

    const { originPath: _omitted, ...withoutPath } = feedbackBody();
    expect((await client.post("/api/me/feedbacks", withoutPath)).status).toBe(201);
    expect((await sendFeedback(client, { originPath: null })).status).toBe(201);
    expect((await stored()).map((row) => row.originPath)).toEqual([null, null]);
  });
});
