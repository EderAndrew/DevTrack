import { randomUUID } from "node:crypto";
import { AdminFeedbackPageSchema, AdminFeedbackSchema, FeedbackSummarySchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { sendFeedback } from "../helpers/feedback";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** 020/US2 — the ADMIN reads and handles the feedbacks (contracts/http-api.md, research J5, J6, J7). */
describe("020/US2 administrador lê e trata os feedbacks", () => {
  let t: TestApp;
  let clock: FixedClock;
  let admin: TestUser;
  let adminClient: ReturnType<typeof api>;
  let ana: TestUser;
  let bruno: TestUser;
  let anaClient: ReturnType<typeof api>;
  let brunoClient: ReturnType<typeof api>;

  beforeAll(async () => {
    clock = new FixedClock("2026-10-25T12:00:00.000Z");
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set("2026-10-25T12:00:00.000Z");
    admin = await createUser(t, { roles: ["ADMIN"], name: "Admin Um" });
    adminClient = api(t, { cookie: await loginAs(t, admin) });
    ana = await createUser(t, { roles: ["STUDENT"], name: "Conta da Ana" });
    await t.prisma.studentProfile.update({ where: { userId: ana.id }, data: { displayName: "Ana Souza" } });
    bruno = await createUser(t, { roles: ["STUDENT"], name: "Bruno Lima" });
    anaClient = api(t, { cookie: await loginAs(t, ana) });
    brunoClient = api(t, { cookie: await loginAs(t, bruno) });
  });

  /** Sends a feedback at the clock's time, then moves the clock one minute ahead. */
  const send = async (client: ReturnType<typeof api>, overrides: Record<string, unknown> = {}) => {
    const res = await sendFeedback(client, overrides);
    expect(res.status).toBe(201);
    clock.advance(MINUTE);
    return res.body.id as string;
  };

  const changeStatus = (id: string, status: string, client = adminClient) => client.post(`/api/feedbacks/${id}/status`, { status });

  it("020/US2-1 lista todos os feedbacks, mais recentes primeiro, com trecho de 140 code points e o nome do aluno", async () => {
    const long = `${"😀".repeat(139)}çã${"x".repeat(50)}`;
    const first = await send(anaClient, { category: "PROBLEM", message: long });
    const second = await send(brunoClient, { category: "PRAISE", message: "O editor de código ajudou muito." });

    const res = await adminClient.get("/api/feedbacks");
    expect(res.status).toBe(200);
    const page = AdminFeedbackPageSchema.parse(res.body);
    expect(page.nextCursor).toBeNull();
    expect(page.items).toEqual([
      {
        id: second,
        category: "PRAISE",
        status: "RECEIVED",
        excerpt: "O editor de código ajudou muito.",
        student: { id: bruno.id, name: "Bruno Lima" },
        createdAt: "2026-10-25T12:01:00.000Z",
      },
      {
        id: first,
        category: "PROBLEM",
        status: "RECEIVED",
        excerpt: `${"😀".repeat(139)}ç`,
        student: { id: ana.id, name: "Ana Souza" },
        createdAt: "2026-10-25T12:00:00.000Z",
      },
    ]);
    expect([...page.items[1]!.excerpt]).toHaveLength(140);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(["category", "createdAt", "excerpt", "id", "status", "student"]);
  });

  it("020/US2-1 páginas de 50 com nextCursor; cursor inválido → 400", async () => {
    const base = new Date("2026-10-01T00:00:00.000Z").getTime();
    await t.prisma.studentFeedback.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        studentId: ana.id,
        submissionId: randomUUID(),
        category: "OTHER" as const,
        message: `Feedback número ${i} do teste.`,
        createdAt: new Date(base + i * MINUTE),
        statusChangedAt: new Date(base + i * MINUTE),
      })),
    });
    const first = AdminFeedbackPageSchema.parse((await adminClient.get("/api/feedbacks")).body);
    expect(first.items).toHaveLength(50);
    expect(first.items[0]!.excerpt).toBe("Feedback número 50 do teste.");
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = AdminFeedbackPageSchema.parse((await adminClient.get(`/api/feedbacks?cursor=${first.nextCursor}`)).body);
    expect(second.items.map((item) => item.excerpt)).toEqual(["Feedback número 0 do teste."]);
    expect(second.nextCursor).toBeNull();
    expect((await adminClient.get("/api/feedbacks?cursor=nao-e-um-cursor")).status).toBe(400);
  });

  it("020/US2-1 GET /feedbacks/summary conta só os RECEIVED", async () => {
    const a = await send(anaClient);
    await send(brunoClient);
    await send(brunoClient);
    expect(FeedbackSummarySchema.parse((await adminClient.get("/api/feedbacks/summary")).body)).toEqual({ received: 3 });
    expect((await changeStatus(a, "IN_REVIEW")).status).toBe(200);
    expect((await adminClient.get("/api/feedbacks/summary")).body).toEqual({ received: 2 });
  });

  it("020/US2-2 filtros de situação e de categoria combinados; valor desconhecido → 400", async () => {
    const problemReceived = await send(anaClient, { category: "PROBLEM" });
    const problemInReview = await send(brunoClient, { category: "PROBLEM" });
    await send(brunoClient, { category: "SUGGESTION" });
    expect((await changeStatus(problemInReview, "IN_REVIEW")).status).toBe(200);

    const ids = async (query: string) => ((await adminClient.get(`/api/feedbacks${query}`)).body.items as { id: string }[]).map((item) => item.id);
    expect(await ids("?category=PROBLEM")).toEqual([problemInReview, problemReceived]);
    expect(await ids("?category=PROBLEM&status=RECEIVED")).toEqual([problemReceived]);
    expect(await ids("?status=IN_REVIEW")).toEqual([problemInReview]);
    expect(await ids("?status=RESOLVED&category=PROBLEM")).toEqual([]);
    for (const query of ["?status=NEW", "?category=BUG", "?status=received", "?outro=1"]) {
      expect((await adminClient.get(`/api/feedbacks${query}`)).status).toBe(400);
    }
  });

  it("020/US2-3 detalhe com mensagem inteira, nome e e-mail, tela e histórico do mais antigo ao mais novo; id inexistente → 404", async () => {
    const id = await send(anaClient, { category: "SUGGESTION", message: "Mensagem completa <b>com</b> https://exemplo.com", originPath: "/minhas-turmas" });
    const other = await createUser(t, { roles: ["ADMIN"], name: "Admin Dois" });
    const otherClient = api(t, { cookie: await loginAs(t, other) });
    expect((await changeStatus(id, "IN_REVIEW")).status).toBe(200);
    clock.advance(MINUTE);
    expect((await changeStatus(id, "RESOLVED", otherClient)).status).toBe(200);

    const res = await adminClient.get(`/api/feedbacks/${id}`);
    expect(res.status).toBe(200);
    expect(AdminFeedbackSchema.parse(res.body)).toEqual({
      id,
      category: "SUGGESTION",
      status: "RESOLVED",
      message: "Mensagem completa <b>com</b> https://exemplo.com",
      originPath: "/minhas-turmas",
      student: { id: ana.id, name: "Ana Souza", email: ana.email },
      createdAt: "2026-10-25T12:00:00.000Z",
      statusChangedAt: "2026-10-25T12:02:00.000Z",
      history: [
        { fromStatus: "RECEIVED", toStatus: "IN_REVIEW", changedBy: { id: admin.id, name: "Admin Um" }, changedAt: "2026-10-25T12:01:00.000Z" },
        { fromStatus: "IN_REVIEW", toStatus: "RESOLVED", changedBy: { id: other.id, name: "Admin Dois" }, changedAt: "2026-10-25T12:02:00.000Z" },
      ],
    });
    expect((await adminClient.get(`/api/feedbacks/${randomUUID()}`)).status).toBe(404);
    expect((await adminClient.get("/api/feedbacks/nao-uuid")).status).toBe(400);
  });

  it("020/US2-4 de RECEIVED para cada uma das três: grava situação, momento, histórico e auditoria; o contador cai", async () => {
    for (const to of ["IN_REVIEW", "RESOLVED", "ARCHIVED"] as const) {
      const id = await send(anaClient);
      const before = (await adminClient.get("/api/feedbacks/summary")).body.received as number;
      clock.advance(MINUTE);
      const res = await changeStatus(id, to);
      expect(res.status).toBe(200);
      expect(AdminFeedbackSchema.parse(res.body)).toMatchObject({ id, status: to, statusChangedAt: clock.now().toISOString() });
      expect(res.body.history).toEqual([{ fromStatus: "RECEIVED", toStatus: to, changedBy: { id: admin.id, name: "Admin Um" }, changedAt: clock.now().toISOString() }]);
      const row = await t.prisma.studentFeedback.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe(to);
      expect(row.statusChangedAt.toISOString()).toBe(clock.now().toISOString());
      expect(await t.prisma.studentFeedbackStatusChange.count({ where: { feedbackId: id } })).toBe(1);
      const events = await t.prisma.auditEvent.findMany({ where: { type: "student_feedback.status_changed", targetId: id } });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        actorType: "USER",
        actorUserId: admin.id,
        targetType: "STUDENT_FEEDBACK",
        metadata: { fromStatus: "RECEIVED", toStatus: to },
      });
      expect((await adminClient.get("/api/feedbacks/summary")).body.received).toBe(before - 1);
    }
  });

  it("020/US2-5 RESOLVED e ARCHIVED reabrem como IN_REVIEW, com histórico", async () => {
    for (const closed of ["RESOLVED", "ARCHIVED"] as const) {
      const id = await send(brunoClient);
      expect((await changeStatus(id, closed)).status).toBe(200);
      clock.advance(MINUTE);
      const res = await changeStatus(id, "IN_REVIEW");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("IN_REVIEW");
      expect((res.body.history as { toStatus: string }[]).map((change) => change.toStatus)).toEqual([closed, "IN_REVIEW"]);
    }
  });

  it("020/US2-6 mesma situação ou RESOLVED → ARCHIVED → 409 sem histórico nem auditoria; RECEIVED ou desconhecida no corpo → 400", async () => {
    const id = await send(anaClient);
    expect((await changeStatus(id, "RESOLVED")).status).toBe(200);
    const events = () => t.prisma.auditEvent.count({ where: { type: "student_feedback.status_changed" } });
    const history = () => t.prisma.studentFeedbackStatusChange.count({ where: { feedbackId: id } });
    expect([await events(), await history()]).toEqual([1, 1]);

    for (const to of ["RESOLVED", "ARCHIVED"]) {
      const res = await changeStatus(id, to);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    }
    for (const body of [{ status: "RECEIVED" }, { status: "DONE" }, {}, { status: "IN_REVIEW", note: "x" }]) {
      expect((await adminClient.post(`/api/feedbacks/${id}/status`, body)).status).toBe(400);
    }
    expect((await changeStatus(randomUUID(), "IN_REVIEW")).status).toBe(404);
    expect([await events(), await history()]).toEqual([1, 1]);
    expect((await t.prisma.studentFeedback.findUniqueOrThrow({ where: { id } })).status).toBe("RESOLVED");
  });

  it("020/FR-012 nenhuma rota edita ou apaga a mensagem de um feedback", async () => {
    const id = await send(anaClient);
    const attempts = [
      adminClient.patch(`/api/feedbacks/${id}`, { message: "editada pelo admin" }),
      adminClient.put(`/api/feedbacks/${id}`, { message: "editada pelo admin" }),
      adminClient.delete(`/api/feedbacks/${id}`),
      anaClient.patch(`/api/me/feedbacks/${id}`, { message: "editada pela aluna" }),
      anaClient.delete(`/api/me/feedbacks/${id}`),
    ];
    for (const res of await Promise.all(attempts)) expect([404, 405]).toContain(res.status);
    const row = await t.prisma.studentFeedback.findUniqueOrThrow({ where: { id } });
    expect(row.message).toBe("A página travou ao salvar a resposta.");
  });
});
