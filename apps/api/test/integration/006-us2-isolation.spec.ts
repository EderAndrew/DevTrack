import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RoleLifecycleService } from "../../src/modules/access-control/role-lifecycle.service";
import { fakeOutput } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

const MISSING_ID = "00000000-0000-4000-8000-000000000001";

/**
 * 006/US2: the workspace of every AI operation is the session user (research A2). A cross
 * attempt is refused with the same 404 as a missing id, and changes nothing.
 */
describe("006/US2 a área de cada professor continua isolada quando a IA é usada", () => {
  let t: AiTestApp;
  let a: TestUser;
  let b: TestUser;
  let cookieA: string;
  let cookieB: string;
  let subjectA: string;
  let subjectB: string;

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    a = await createUser(t, { roles: ["TEACHER"], name: "Professora A" });
    b = await createUser(t, { roles: ["TEACHER"], name: "Professor B" });
    cookieA = await loginAs(t, a);
    cookieB = await loginAs(t, b);
    subjectA = (await createSubject(t, a.id)).id;
    subjectB = (await createSubject(t, b.id)).id;
    t.provider.script(fakeOutput({ summary: "ok" }));
  });

  const run = (cookie: string, subjectId: string, body: Record<string, unknown> = {}) =>
    requestExecution(t, cookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId }, ...body });

  it("006/US2-1 A e B executam cada um na própria área, e workspace_id é o usuário da sessão", async () => {
    const resA = await run(cookieA, subjectA);
    const resB = await run(cookieB, subjectB);
    expect([resA.status, resB.status]).toEqual([202, 202]);
    await drain(t);

    const rows = await t.prisma.aiExecution.findMany({ select: { id: true, workspaceId: true, requestedByUserId: true, status: true } });
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: resA.body.id, workspaceId: a.id, requestedByUserId: a.id, status: "COMPLETED" },
        { id: resB.body.id, workspaceId: b.id, requestedByUserId: b.id, status: "COMPLETED" },
      ]),
    );

    const listA = await api(t, { cookie: cookieA }).get("/api/ai/executions");
    expect(listA.body.items.map((item: { id: string }) => item.id)).toEqual([resA.body.id]);
    const listB = await api(t, { cookie: cookieB }).get("/api/ai/executions");
    expect(listB.body.items.map((item: { id: string }) => item.id)).toEqual([resB.body.id]);
  });

  it("006/US2-2 A sobre a disciplina de B → 404 idêntico ao de inexistente, e nenhuma execução", async () => {
    const foreign = await run(cookieA, subjectB);
    const missing = await run(cookieA, MISSING_ID);
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
    expect(foreign.body).toEqual(missing.body);
    expect(await t.prisma.aiExecution.count()).toBe(0);
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.requested" } })).toBe(0);
  });

  it.each(["workspaceId", "teacherId", "ownerId"])("006/US2-3 corpo com %s → 400, e nenhuma execução", async (field) => {
    const res = await run(cookieA, subjectA, { [field]: b.id });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await t.prisma.aiExecution.count()).toBe(0);
  });

  describe("006/US2-4 B não alcança a execução de A", () => {
    it("consulta, resultado e cancelamento → o mesmo 404 de id inexistente, sem efeito", async () => {
      const { body } = await run(cookieA, subjectA);
      await drain(t);
      const clientB = api(t, { cookie: cookieB });

      for (const suffix of ["", "/result"]) {
        const foreign = await clientB.get(`/api/ai/executions/${body.id}${suffix}`);
        const missing = await clientB.get(`/api/ai/executions/${MISSING_ID}${suffix}`);
        expect({ suffix, status: foreign.status }).toEqual({ suffix, status: 404 });
        expect(foreign.body).toEqual(missing.body);
      }

      const queued = await run(cookieA, subjectA);
      const cancel = await clientB.post(`/api/ai/executions/${queued.body.id}/cancel`, {});
      expect(cancel.status).toBe(404);
      expect(cancel.body).toEqual((await clientB.post(`/api/ai/executions/${MISSING_ID}/cancel`, {})).body);
      expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: queued.body.id }, select: { status: true, cancelRequestedAt: true } })).toEqual({
        status: "QUEUED",
        cancelRequestedAt: null,
      });
    });

    it("a mesma chave de idempotência de A, usada por B, cria outra execução em B (a chave é por usuário)", async () => {
      const key = crypto.randomUUID();
      const resA = await run(cookieA, subjectA, { idempotencyKey: key });
      const resB = await run(cookieB, subjectB, { idempotencyKey: key });
      expect([resA.status, resB.status]).toEqual([202, 202]);
      expect(resB.body.id).not.toBe(resA.body.id);
    });
  });

  describe("006/US2-5 administrador sem acesso pedagógico", () => {
    it("ADMIN sem TEACHER → 403 em todas as rotas de execução, só o corpo de erro", async () => {
      const { body } = await run(cookieA, subjectA);
      const admin = await createUser(t, { roles: ["ADMIN"] });
      const client = api(t, { cookie: await loginAs(t, admin) });
      const calls = [
        client.post("/api/ai/executions", { agentKey: "reference-l1", idempotencyKey: crypto.randomUUID() }),
        client.get("/api/ai/executions"),
        client.get(`/api/ai/executions/${body.id}`),
        client.get(`/api/ai/executions/${body.id}/result`),
        client.post(`/api/ai/executions/${body.id}/cancel`, {}),
      ];
      for (const res of await Promise.all(calls)) {
        expect({ status: res.status, body: res.body }).toEqual({ status: 403, body: { statusCode: 403, code: "FORBIDDEN", message: expect.any(String) } });
      }
      expect(await t.prisma.aiExecution.count()).toBe(1);
    });

    it("ADMIN + TEACHER vê só as próprias execuções; a de A é 404", async () => {
      const { body } = await run(cookieA, subjectA);
      const both = await createUser(t, { roles: ["ADMIN", "TEACHER"] });
      const cookie = await loginAs(t, both);
      const own = await run(cookie, (await createSubject(t, both.id)).id);
      expect(own.status).toBe(202);

      const client = api(t, { cookie });
      expect((await client.get("/api/ai/executions")).body.items.map((item: { id: string }) => item.id)).toEqual([own.body.id]);
      expect((await client.get(`/api/ai/executions/${body.id}`)).status).toBe(404);
      expect((await run(cookie, subjectA)).status).toBe(404);
    });
  });

  describe("006/FR-032 a autorização é conferida de novo no início do processamento", () => {
    it("professor com o papel TEACHER suspenso depois do pedido → FAILED AI_CONTEXT_ACCESS_DENIED, sem chamar o provedor", async () => {
      const { body } = await run(cookieA, subjectA);
      const admin = await createUser(t, { roles: ["ADMIN"] });
      await t.prisma.runInTransaction((tx) => t.get(RoleLifecycleService).changeStatus(tx, a.id, "TEACHER", "SUSPENDED", admin.id));

      await drain(t);
      const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.id } });
      expect(row).toMatchObject({ status: "FAILED", errorCode: "AI_CONTEXT_ACCESS_DENIED", modelCalls: 0 });
      expect(t.provider.requests).toHaveLength(0);
      expect(await t.prisma.aiModelCall.count()).toBe(0);
    });

    it.each([
      ["transferida para B", "transfer"],
      ["removida", "delete"],
    ])("disciplina de A %s antes do início → FAILED AI_CONTEXT_ACCESS_DENIED, sem chamar o provedor", async (_label, change) => {
      const { body } = await run(cookieA, subjectA);
      if (change === "transfer") await t.prisma.subject.update({ where: { id: subjectA }, data: { teacherId: b.id } });
      else await t.prisma.subject.delete({ where: { id: subjectA } });

      await drain(t);
      const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.id } });
      expect(row).toMatchObject({ status: "FAILED", errorCode: "AI_CONTEXT_ACCESS_DENIED" });
      expect(t.provider.requests).toHaveLength(0);
      const failed = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.failed", targetId: body.id } });
      expect(failed.metadata).toMatchObject({ errorCode: "AI_CONTEXT_ACCESS_DENIED" });
    });
  });

  it("usuário que é professor e aluno: as permissões de aluno não abrem nada da IA além da própria área", async () => {
    const student = await createUser(t, { roles: ["STUDENT"] });
    const studentClient = api(t, { cookie: await loginAs(t, student) });
    expect((await studentClient.get("/api/ai/executions")).status).toBe(403);
    expect((await requestExecution(t, await loginAs(t, student), { agentKey: "reference-l1" })).status).toBe(403);

    const both = await createUser(t, { roles: ["TEACHER", "STUDENT"] });
    const cookie = await loginAs(t, both);
    const { body } = await run(cookieA, subjectA);
    expect((await run(cookie, subjectA)).status).toBe(404);
    expect((await api(t, { cookie }).get(`/api/ai/executions/${body.id}`)).status).toBe(404);
    expect((await api(t, { cookie }).get("/api/ai/executions")).body.items).toEqual([]);
  });
});
