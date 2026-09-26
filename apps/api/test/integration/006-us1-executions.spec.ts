import { randomUUID } from "node:crypto";
import { AiExecutionViewSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { fakeDelay, fakeOutput } from "../fixtures/ai/fake-model-provider";
import { INSTRUCTIONS_MARKER } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

describe("006/US1 execução assíncrona de agente", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  const request = (body: Record<string, unknown> = {}) =>
    requestExecution(t, cookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId }, ...body });

  it("006/US1-1 006/SC-006 o pedido responde 202 QUEUED na hora, sem esperar o modelo", async () => {
    t.provider.script(fakeDelay(30_000, fakeOutput({ summary: "x" })));
    const started = Date.now();
    const res = await request({ input: { text: "MARCADOR-ENTRADA-006" } });
    const elapsed = Date.now() - started;

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: "QUEUED", agent: { key: "reference-l1", version: 1 }, riskLevel: "L1_READ_ONLY" });
    expect(elapsed).toBeLessThan(1_000);
    expect(t.provider.requests).toHaveLength(0);

    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.requested" } });
    expect(event).toMatchObject({ actorType: "USER", actorUserId: teacher.id, targetType: "AI_EXECUTION", targetId: res.body.id });
    const metadata = JSON.stringify(event.metadata);
    expect(metadata).not.toContain("MARCADOR-ENTRADA-006");
    expect(metadata).not.toContain(INSTRUCTIONS_MARKER);

    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ workspaceId: teacher.id, provider: "fake", model: "fake-model-1", promptVersion: 1 });
    expect(row.deadlineAt.getTime() - row.createdAt.getTime()).toBe(t.config.ai.limits.totalTimeoutMs);
  });

  it("006/US1-2 o processamento passa por RUNNING e VALIDATING_OUTPUT até COMPLETED, com as passagens datadas e o uso", async () => {
    t.provider.script(fakeOutput({ summary: "resumo" }));
    const { body } = await request();
    await drain(t);

    const view = await api(t, { cookie }).get(`/api/ai/executions/${body.id}`);
    expect(view.status).toBe(200);
    expect(view.body.status).toBe("COMPLETED");
    expect(view.body.transitions.map((tr: { to: string }) => tr.to)).toEqual(["QUEUED", "RUNNING", "VALIDATING_OUTPUT", "COMPLETED"]);
    for (const transition of view.body.transitions) expect(Date.parse(transition.at)).not.toBeNaN();
    expect(view.body.completedAt).not.toBeNull();
    expect(view.body.failedAt).toBeNull();
    expect(view.body.durationMs).toBeGreaterThanOrEqual(0);

    const calls = await t.prisma.aiModelCall.findMany({ where: { executionId: body.id } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ status: "SUCCEEDED", attempts: 1, inputTokens: 120, outputTokens: 30, totalTokens: 150, currency: "USD" });
    expect(calls[0]!.estimatedCost?.toString()).toBe("0.00018");
  });

  it("006/US1-3 a consulta não mostra provedor, modelo, instruções nem entrada; o resultado L1 vem validado", async () => {
    t.provider.script(fakeOutput({ summary: "resumo validado" }));
    const { body } = await request({ input: { text: "MARCADOR-ENTRADA-006" } });
    await drain(t);

    const view = await api(t, { cookie }).get(`/api/ai/executions/${body.id}`);
    expect(AiExecutionViewSchema.safeParse(view.body).success).toBe(true);
    const serialized = JSON.stringify(view.body);
    for (const hidden of ["fake-model-1", '"fake"', INSTRUCTIONS_MARKER, "MARCADOR-ENTRADA-006", "provider", "model"]) {
      expect(serialized, hidden).not.toContain(hidden);
    }

    const result = await api(t, { cookie }).get(`/api/ai/executions/${body.id}/result`);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ executionId: body.id, schemaVersion: 1, output: { summary: "resumo validado" } });
  });

  it("resultado de execução não concluída → 409", async () => {
    const { body } = await request();
    const result = await api(t, { cookie }).get(`/api/ai/executions/${body.id}/result`);
    expect(result.status).toBe(409);
    expect(result.body.code).toBe("INVALID_STATE_TRANSITION");
  });

  describe("006/US1-4 cancelamento", () => {
    it("na fila → CANCELLED na hora, e o processamento não chama o modelo", async () => {
      t.provider.script(fakeOutput({ summary: "x" }));
      const { body } = await request();
      const res = await api(t, { cookie }).post(`/api/ai/executions/${body.id}/cancel`, {});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "CANCELLED", errorCode: "AI_EXECUTION_CANCELLED", cancelRequested: false });
      await drain(t);
      expect(t.provider.requests).toHaveLength(0);
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.cancelled", actorType: "USER" } })).toBe(1);

      const again = await api(t, { cookie }).post(`/api/ai/executions/${body.id}/cancel`, {});
      expect(again.status).toBe(200);
      expect(again.body.status).toBe("CANCELLED");
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.cancelled" } })).toBe(1);
    });

    it("em andamento → cancelRequested, e a etapa seguinte encerra como CANCELLED sem gravar resultado", async () => {
      t.provider.script(fakeDelay(2_000, fakeOutput({ summary: "tarde demais" })));
      const { body } = await request();
      const worker = t.get(AiExecutionWorker);
      const running = worker.runOnce();
      await waitFor(async () => (await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.id } })).status === "RUNNING");
      await waitFor(async () => t.provider.requests.length === 1);

      const res = await api(t, { cookie }).post(`/api/ai/executions/${body.id}/cancel`, {});
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "RUNNING", cancelRequested: true });
      await running;

      const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.id }, include: { output: true } });
      expect(row).toMatchObject({ status: "CANCELLED", errorCode: "AI_EXECUTION_CANCELLED" });
      expect(row.output).toBeNull();
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.cancel_requested" } })).toBe(1);
    });

    it("concluída → 409 INVALID_STATE_TRANSITION", async () => {
      t.provider.script(fakeOutput({ summary: "x" }));
      const { body } = await request();
      await drain(t);
      const res = await api(t, { cookie }).post(`/api/ai/executions/${body.id}/cancel`, {});
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    });
  });

  describe("006/US1-5 006/FR-025 idempotência", () => {
    it("mesma chave → 200 e a mesma execução; chave igual com pedido diferente → 409", async () => {
      const idempotencyKey = randomUUID();
      const first = await request({ idempotencyKey });
      const second = await request({ idempotencyKey });
      expect(first.status).toBe(202);
      expect(second.status).toBe(200);
      expect(second.body.id).toBe(first.body.id);

      const other = await request({ idempotencyKey, input: { text: "outro" } });
      expect(other.status).toBe(409);
      expect(other.body.code).toBe("AI_IDEMPOTENCY_KEY_REUSED");
      expect(await t.prisma.aiExecution.count()).toBe(1);
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.requested" } })).toBe(1);
    });

    it("dois pedidos simultâneos com a mesma chave criam uma execução só", async () => {
      const idempotencyKey = randomUUID();
      const results = await Promise.all([request({ idempotencyKey }), request({ idempotencyKey })]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 202]);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await t.prisma.aiExecution.count()).toBe(1);
    });
  });

  describe("006/US1-6 agente inexistente, em rascunho ou desabilitado", () => {
    it.each([
      ["nao-existe", 404, "AI_AGENT_NOT_FOUND"],
      ["reference-draft", 404, "AI_AGENT_NOT_FOUND"],
    ])("%s → %d %s", async (agentKey, status, code) => {
      const res = await request({ agentKey });
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
      expect(await t.prisma.aiExecution.count()).toBe(0);
    });

    it("DISABLED → 409 AI_AGENT_DISABLED", async () => {
      await t.prisma.aiAgent.update({ where: { key: "reference-l1" }, data: { status: "DISABLED" } });
      const res = await request();
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("AI_AGENT_DISABLED");
      expect(await t.prisma.aiExecution.count()).toBe(0);
    });
  });

  it("professor sem a permissão que o agente exige → 403", async () => {
    const res = await request({ agentKey: "reference-restricted" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(await t.prisma.aiExecution.count()).toBe(0);
  });

  it("lista as próprias execuções, mais novas primeiro, com filtro e cursor", async () => {
    t.provider.script(fakeOutput({ summary: "x" }));
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) ids.push((await request()).body.id);
    await api(t, { cookie }).post(`/api/ai/executions/${ids[0]}/cancel`, {});

    const all = await api(t, { cookie }).get("/api/ai/executions");
    expect(all.status).toBe(200);
    expect(all.body.items.map((i: { id: string }) => i.id)).toEqual([...ids].reverse());
    expect(all.body.nextCursor).toBeNull();

    const cancelled = await api(t, { cookie }).get("/api/ai/executions?status=CANCELLED");
    expect(cancelled.body.items.map((i: { id: string }) => i.id)).toEqual([ids[0]]);

    const other = await createUser(t, { roles: ["TEACHER"] });
    const empty = await api(t, { cookie: await loginAs(t, other) }).get("/api/ai/executions");
    expect(empty.body.items).toEqual([]);
  });
});

async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs = 5_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > until) throw new Error("waitFor: timeout");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
