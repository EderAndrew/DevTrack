import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { AI_DEFINITIONS, defineAgent } from "../../src/modules/ai/definitions/types";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { AiOperationsService } from "../../src/modules/ai/operations/ai-operations.service";
import { referenceAiDefinitions } from "../fixtures/ai/definitions";
import { type FakeStep, fakeDelay, fakeError, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { REFERENCE_L1_CONTINUE } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiExecution, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, testConfig } from "../helpers/test-app";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";

const CALL_TIMEOUT_MS = 200;
const NON_FINAL = ["QUEUED", "RUNNING", "WAITING_TOOL", "VALIDATING_OUTPUT"] as const;

/** No real waits between retries. */
function instantRetries(t: { get: AiTestApp["get"] }) {
  t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
}

/**
 * 006/US6: every execution is bounded (FR-048), retries only transient failures (FR-049), ends in
 * a final status by its deadline even when its process died (SC-005), and the per-agent and
 * per-config kill switches stop new and queued work (FR-051).
 */
describe("006/US6 limites e estado conhecido", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    const base = testConfig().ai;
    t = await createAiTestApp({ config: { ai: { ...base, limits: { ...base.limits, modelCallTimeoutMs: CALL_TIMEOUT_MS } } } });
    instantRetries(t);
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  const request = (agentKey = "reference-l1", extra: object = {}) =>
    requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId }, ...extra });

  const run = async (agentKey: string, ...steps: FakeStep[]) => {
    t.provider.script(...steps);
    const res = await request(agentKey);
    expect(res.status).toBe(202);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id }, include: { modelCallRows: { orderBy: { sequence: "asc" } } } });
  };

  describe("006/US6-1 novas tentativas só em falhas transitórias", () => {
    it("UNAVAILABLE duas vezes e depois a saída → COMPLETED, com attempts 3", async () => {
      const execution = await run("reference-l1", fakeError("UNAVAILABLE"), fakeError("UNAVAILABLE"), fakeOutput({ summary: "ok" }));
      expect(execution.status).toBe("COMPLETED");
      expect(execution.modelCallRows).toEqual([expect.objectContaining({ status: "SUCCEEDED", attempts: 3 })]);
    });

    it("três falhas UNAVAILABLE → FAILED AI_PROVIDER_ERROR", async () => {
      const execution = await run("reference-l1", fakeError("UNAVAILABLE"));
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_PROVIDER_ERROR" });
      expect(execution.modelCallRows[0]).toMatchObject({ status: "FAILED", attempts: t.config.ai.limits.maxRetries + 1, errorCode: "AI_PROVIDER_ERROR" });
    });

    it("RATE_LIMITED persistente → FAILED AI_RATE_LIMITED", async () => {
      const execution = await run("reference-l1", fakeError("RATE_LIMITED"));
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_RATE_LIMITED" });
    });

    it("INVALID_REQUEST não é repetido (attempts 1)", async () => {
      const execution = await run("reference-l1", fakeError("INVALID_REQUEST"), fakeOutput({ summary: "não deveria chegar" }));
      expect(execution.status).toBe("FAILED");
      expect(execution.modelCallRows[0]).toMatchObject({ attempts: 1 });
      expect(t.provider.requests).toHaveLength(1);
    });
  });

  it("006/US6-2 resposta mais lenta que o tempo por chamada → TIMED_OUT AI_TIMEOUT", async () => {
    const execution = await run("reference-l1", fakeDelay(CALL_TIMEOUT_MS * 5, fakeOutput({ summary: "tarde" })));
    expect(execution).toMatchObject({ status: "TIMED_OUT", errorCode: "AI_TIMEOUT" });
    expect(execution.modelCallRows[0]).toMatchObject({ status: "TIMED_OUT", errorCode: "AI_TIMEOUT" });
  });

  describe("006/US6-3 laços limitados", () => {
    it("11ª chamada de ferramenta → FAILED AI_EXECUTION_LIMIT_EXCEEDED, com 10 executadas", async () => {
      const max = t.config.ai.limits.maxToolCalls;
      const many: FakeStep = { toolCalls: Array.from({ length: max + 1 }, () => ({ toolKey: "reference.read-subject", arguments: { subjectId } })) };
      const execution = await run("reference-l1", many);
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_EXECUTION_LIMIT_EXCEEDED", toolCalls: max });
    });

    it("modelo que nunca para de pedir ferramentas → a 6ª chamada ao modelo não acontece", async () => {
      const execution = await run("reference-l1", fakeToolCall("reference.read-subject", { subjectId }));
      const max = t.config.ai.limits.maxModelCalls;
      expect(execution).toMatchObject({ status: "FAILED", errorCode: "AI_EXECUTION_LIMIT_EXCEEDED", modelCalls: max });
      expect(t.provider.requests).toHaveLength(max);
    });
  });

  it("006/US6-4 entrada acima do limite (200 KB + 1) → 422 antes de criar", async () => {
    const overhead = Buffer.byteLength(JSON.stringify({ text: "" }), "utf8");
    const text = "a".repeat(t.config.ai.limits.maxInputBytes - overhead + 1);
    const res = await request("reference-l1", { input: { text } });
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 422, code: "AI_EXECUTION_LIMIT_EXCEEDED" });
    expect(await t.prisma.aiExecution.count()).toBe(0);
    // Exactly at the limit is accepted by the size check (the agent's own schema caps `text` lower).
  });

  // 006/US6-5 (cancelamento) é coberto por 006/US1-4 em 006-us1-executions.spec.ts.

  describe("006/US6-6 chaves de interrupção", () => {
    it("agente desabilitado → pedido novo 409, e as QUEUED viram CANCELLED AI_AGENT_DISABLED sem chamar o provedor", async () => {
      t.provider.script(fakeOutput({ summary: "ok" }));
      const queued = [(await request()).body.id, (await request()).body.id];
      const admin = await createUser(t, { roles: ["ADMIN"] });

      const change = await t.get(AiOperationsService).changeAgentStatus({ userId: admin.id, requestId: null }, "reference-l1", "DISABLED");
      expect(change).toEqual({ changed: true, cancelledExecutions: 2 });
      const rows = await t.prisma.aiExecution.findMany({ where: { id: { in: queued } } });
      expect(rows.map((row) => [row.status, row.errorCode])).toEqual([
        ["CANCELLED", "AI_AGENT_DISABLED"],
        ["CANCELLED", "AI_AGENT_DISABLED"],
      ]);
      const events = await t.prisma.auditEvent.findMany({ where: { type: "ai_execution.cancelled" } });
      expect(events.map((event) => event.actorType)).toEqual(["SYSTEM", "SYSTEM"]);
      const disabled = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_agent.disabled" } });
      expect(disabled).toMatchObject({ actorType: "USER", actorUserId: admin.id, targetType: "AI_AGENT" });
      expect(disabled.metadata).toEqual({ agentKey: "reference-l1", version: 1, cancelledExecutions: 2 });

      const refused = await request();
      expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 409, code: "AI_AGENT_DISABLED" });
      await drain(t);
      expect(t.provider.requests).toHaveLength(0);

      // Same status again changes nothing; enabling brings requests back.
      expect(await t.get(AiOperationsService).changeAgentStatus({ userId: admin.id, requestId: null }, "reference-l1", "DISABLED")).toEqual({ changed: false, cancelledExecutions: 0 });
      await t.get(AiOperationsService).changeAgentStatus({ userId: admin.id, requestId: null }, "reference-l1", "ACTIVE");
      expect((await request()).status).toBe(202);
    });

    it("agente desabilitado depois de assumida → o runner cancela no início, sem chamar o provedor", async () => {
      const { body } = await request();
      await t.prisma.aiAgent.update({ where: { key: "reference-l1" }, data: { status: "DISABLED" } });
      await drain(t);
      expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.id } })).toMatchObject({ status: "CANCELLED", errorCode: "AI_AGENT_DISABLED" });
      expect(t.provider.requests).toHaveLength(0);
    });

    it("agente em rascunho não muda de estado pela chave de interrupção → 409", async () => {
      const admin = await createUser(t, { roles: ["ADMIN"] });
      await expect(t.get(AiOperationsService).changeAgentStatus({ userId: admin.id, requestId: null }, "reference-draft", "ACTIVE")).rejects.toMatchObject({ code: "INVALID_STATE_TRANSITION" });
      await expect(t.get(AiOperationsService).changeAgentStatus({ userId: admin.id, requestId: null }, "nao-existe", "ACTIVE")).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("configuração de modelo desabilitada → pedido novo 503 AI_MODEL_UNAVAILABLE, e a da fila falha no início sem chamada", async () => {
      const { body } = await request();
      await t.prisma.aiModelConfig.update({ where: { key: "fake-default" }, data: { status: "DISABLED" } });

      const refused = await request();
      expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 503, code: "AI_MODEL_UNAVAILABLE" });
      await drain(t);
      expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.id } })).toMatchObject({ status: "FAILED", errorCode: "AI_MODEL_UNAVAILABLE" });
      expect(t.provider.requests).toHaveLength(0);
    });
  });

  describe("006/US6-7 006/SC-005 nada fica em andamento depois do prazo", () => {
    it("execução RUNNING de um processo morto → o ciclo depois do deadline_at a encerra TIMED_OUT", async () => {
      const deadlineAt = new Date(Date.now() - 1_000);
      const orphan = await createAiExecution(t, teacher.id, "reference-l1", { status: "RUNNING", createdAt: new Date(deadlineAt.getTime() - 120_000), deadlineAt });
      await t.get(AiExecutionWorker).runOnce(new Date());
      expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: orphan.id } })).toMatchObject({ status: "TIMED_OUT", errorCode: "AI_TIMEOUT" });
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.failed", targetId: orphan.id } });
      expect(event).toMatchObject({ actorType: "SYSTEM" });
      expect(event.metadata).toMatchObject({ status: "TIMED_OUT", errorCode: "AI_TIMEOUT" });
    });

    it("com o relógio no prazo + 1 min, nenhuma execução segue não final", async () => {
      const now = Date.now();
      for (const status of NON_FINAL) {
        await createAiExecution(t, teacher.id, "reference-l1", { status, createdAt: new Date(now - 60_000), deadlineAt: new Date(now + 60_000) });
      }
      await t.get(AiExecutionWorker).runOnce(new Date(now + 60_000 + 60_000));
      expect(await t.prisma.aiExecution.count({ where: { status: { in: [...NON_FINAL] } } })).toBe(0);
      expect(t.provider.requests).toHaveLength(0);
    });
  });
});

/** 006/FR-048: an agent's lower limits apply to its executions. */
describe("006/FR-048 limites menores declarados pelo agente valem", () => {
  const LEAN = defineAgent({
    ...REFERENCE_L1_CONTINUE,
    key: "reference-lean",
    name: "Agente de referência (enxuto)",
    prompt: { ...REFERENCE_L1_CONTINUE.prompt, key: "reference-lean" },
    limits: { maxModelCalls: 2, maxInputBytes: 64 },
  });
  const reference = referenceAiDefinitions();
  const definitions = { ...reference, agents: [...reference.agents, LEAN] };
  let app: Awaited<ReturnType<typeof createTestApp>>;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    app = await createTestApp({ overrides: [{ provide: AI_DEFINITIONS, useValue: definitions }] });
    instantRetries(app);
    await resetDb(app.prisma);
    await app.get(AiRegistrySync).sync();
    const teacher = await createUser(app, { roles: ["TEACHER"] });
    cookie = await loginAs(app, teacher);
    subjectId = (await createSubject(app, teacher.id)).id;
  });
  afterAll(() => app.close());

  it("maxModelCalls 2 e maxInputBytes 64 do agente, abaixo dos globais", async () => {
    const tooBig = await requestExecution(app, cookie, { agentKey: "reference-lean", input: { text: "x".repeat(64) } });
    expect({ status: tooBig.status, code: tooBig.body.code }).toEqual({ status: 422, code: "AI_EXECUTION_LIMIT_EXCEEDED" });

    definitions.provider.script(fakeToolCall("reference.read-subject", { subjectId }));
    const res = await requestExecution(app, cookie, { agentKey: "reference-lean", resource: { type: "SUBJECT", id: subjectId } });
    expect(res.status).toBe(202);
    await drain(app);
    expect(await app.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id } })).toMatchObject({
      status: "FAILED",
      errorCode: "AI_EXECUTION_LIMIT_EXCEEDED",
      modelCalls: 2,
    });
  });
});
