import { Prisma } from "../../src/generated/prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeOutput } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiExecution, createAiTestApp, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * 006/US7: the administrator operates the AI foundation — health, aggregates, agents and model
 * configs, and the kill switches — without any pedagogical content.
 */
describe("006/US7 o administrador opera a IA", () => {
  let t: AiTestApp;
  let admin: TestUser;
  let adminCookie: string;
  let teacher: TestUser;

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    admin = await createUser(t, { roles: ["ADMIN"] });
    adminCookie = await loginAs(t, admin);
    teacher = await createUser(t, { roles: ["TEACHER"] });
  });

  const ops = () => api(t, { cookie: adminCookie });

  async function modelCall(executionId: string, sequence: number, startedAt: Date, usage: { input: number | null; output: number | null; cost: string | null }) {
    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: executionId } });
    await t.prisma.aiModelCall.create({
      data: {
        executionId,
        sequence,
        modelConfigId: execution.modelConfigId,
        provider: execution.provider,
        model: execution.model,
        status: "SUCCEEDED",
        attempts: 1,
        startedAt,
        durationMs: 100,
        inputTokens: usage.input,
        outputTokens: usage.output,
        totalTokens: usage.input === null || usage.output === null ? null : usage.input + usage.output,
        estimatedCost: usage.cost === null ? null : new Prisma.Decimal(usage.cost),
        currency: usage.cost === null ? null : "USD",
        costSource: usage.cost === null ? null : "PRICE",
      },
    });
  }

  describe("006/US7-1 indicadores por agente, versão, instruções, provedor e modelo", () => {
    it("totais por período (24h, 7d, 30d) conferem com as execuções criadas", async () => {
      const now = Date.now();
      const at = (ago: number) => new Date(now - ago);
      const make = (ago: number, status: "COMPLETED" | "FAILED" | "TIMED_OUT" | "CANCELLED", durationMs: number, calls = 1, tools = 0) =>
        createAiExecution(t, teacher.id, "reference-l1", { status, createdAt: at(ago), durationMs, modelCalls: calls, toolCalls: tools });
      await make(2 * HOUR, "COMPLETED", 1_000, 2, 1);
      await make(3 * HOUR, "FAILED", 3_000, 1, 0);
      await make(3 * DAY, "TIMED_OUT", 120_000);
      await make(20 * DAY, "CANCELLED", 500, 0);
      await make(40 * DAY, "COMPLETED", 1_000);
      await createAiExecution(t, teacher.id, "reference-l2", { status: "COMPLETED", createdAt: at(HOUR), durationMs: 2_000 });

      const byPeriod = async (period: string) => (await ops().get(`/api/ai/operations/metrics?period=${period}`)).body;
      const l1 = (body: { byAgent: { agentKey: string }[] }) => body.byAgent.find((row) => row.agentKey === "reference-l1");

      const day = await byPeriod("24h");
      expect(l1(day)).toEqual({
        agentKey: "reference-l1",
        agentVersion: 1,
        promptVersion: 1,
        provider: "fake",
        model: "fake-model-1",
        taskKey: "reference-default",
        executions: 2,
        completed: 1,
        failed: 1,
        timedOut: 0,
        cancelled: 0,
        fallbacks: 0,
        // 009/FR-015: none of these executions escalated.
        escalations: 0,
        avgDurationMs: 2_000,
        modelCalls: 3,
        toolCalls: 1,
        // 007 research C12.5: none of these executions failed validation, proposed or has call rows.
        outputInvalid: 0,
        proposals: { created: 0, approved: 0, partiallyApproved: 0, rejected: 0, expired: 0 },
        avgTotalTokens: null,
        avgEstimatedCost: null,
        currency: null,
      });
      expect(day.byAgent.map((row: { agentKey: string }) => row.agentKey).sort()).toEqual(["reference-l1", "reference-l2"]);
      expect(l1(await byPeriod("7d"))).toMatchObject({ executions: 3, timedOut: 1 });
      expect(l1(await byPeriod("30d"))).toMatchObject({ executions: 4, cancelled: 1 });
      // Without a period, the last 7 days.
      expect(l1((await ops().get("/api/ai/operations/metrics")).body)).toMatchObject({ executions: 3 });
      expect((await ops().get("/api/ai/operations/metrics?period=1y")).status).toBe(400);
    });

    it("uso com tokens e custo somado exato; nulos quando o provedor não informa", async () => {
      const execution = await createAiExecution(t, teacher.id, "reference-l1", { status: "COMPLETED", createdAt: new Date(Date.now() - HOUR) });
      const recent = new Date(Date.now() - HOUR);
      await modelCall(execution.id, 1, recent, { input: 1_000, output: 200, cost: "0.001400" });
      await modelCall(execution.id, 2, recent, { input: 500, output: 100, cost: "0.000700" });
      await modelCall(execution.id, 3, new Date(Date.now() - 10 * DAY), { input: 9_999, output: 9_999, cost: "9.000000" });

      const body = (await ops().get("/api/ai/operations/metrics?period=24h")).body;
      expect(body.byModel).toEqual([
        { provider: "fake", model: "fake-model-1", tier: null, family: null, calls: 2, failedCalls: 0, fallbackCalls: 0, avgDurationMs: 100, inputTokens: 1_500, outputTokens: 300, totalTokens: 1_800, estimatedCost: "0.002100", currency: "USD" },
      ]);

      await t.prisma.aiModelCall.deleteMany();
      await modelCall(execution.id, 4, recent, { input: null, output: null, cost: null });
      const empty = (await ops().get("/api/ai/operations/metrics?period=24h")).body;
      expect(empty.byModel).toEqual([
        { provider: "fake", model: "fake-model-1", tier: null, family: null, calls: 1, failedCalls: 0, fallbackCalls: 0, avgDurationMs: 100, inputTokens: null, outputTokens: null, totalTokens: null, estimatedCost: null, currency: null },
      ]);
    });

    it("sem execuções no período → listas vazias", async () => {
      const body = (await ops().get("/api/ai/operations/metrics?period=24h")).body;
      expect(body).toMatchObject({ byAgent: [], byModel: [] });
    });
  });

  it("agentes e configurações listados com versões, fila e agentes de cada configuração", async () => {
    await createAiExecution(t, teacher.id, "reference-l1", { status: "QUEUED" });
    await createAiExecution(t, teacher.id, "reference-l1", { status: "RUNNING" });
    const agents = (await ops().get("/api/ai/operations/agents")).body;
    expect(agents.find((agent: { key: string }) => agent.key === "reference-l1")).toEqual({
      key: "reference-l1",
      name: "Agente de referência (leitura)",
      description: expect.any(String),
      status: "ACTIVE",
      version: 1,
      riskLevel: "L1_READ_ONLY",
      taskKey: "reference-default",
      primaryModelConfigKey: "fake-default",
      fallbackModelConfigKey: null,
      promptVersion: 1,
      outputSchemaVersion: 1,
      toolKeys: ["reference.disabled", "reference.leaky", "reference.read-subject"],
      queued: 1,
      running: 1,
    });
    const configs = (await ops().get("/api/ai/operations/model-configs")).body;
    expect(configs.map((config: { key: string }) => config.key)).toEqual(["fake-alt", "fake-default", "fake-no-price"]);
    expect(configs.find((config: { key: string }) => config.key === "fake-default")).toMatchObject({ hasPrice: true, status: "ENABLED", agentKeys: expect.arrayContaining(["reference-l1", "reference-l2"]) });
    expect(configs.find((config: { key: string }) => config.key === "fake-no-price")).toMatchObject({ hasPrice: false, agentKeys: [] });
  });

  describe("006/US7-2 habilitar e desabilitar agentes", () => {
    it("desabilitar → pedido novo 409 e ai_agent.disabled com cancelledExecutions; reabilitar volta a aceitar", async () => {
      await createAiExecution(t, teacher.id, "reference-l1", { status: "QUEUED" });
      const off = await ops().post("/api/ai/operations/agents/reference-l1/status", { status: "DISABLED" });
      expect(off.status).toBe(200);
      expect(off.body).toMatchObject({ key: "reference-l1", status: "DISABLED", queued: 0 });
      const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_agent.disabled" } });
      expect(event).toMatchObject({ actorType: "USER", actorUserId: admin.id, targetType: "AI_AGENT" });
      expect(event.metadata).toEqual({ agentKey: "reference-l1", version: 1, cancelledExecutions: 1 });

      const teacherCookie = await loginAs(t, teacher);
      const subjectId = (await createSubject(t, teacher.id)).id;
      const refused = await requestExecution(t, teacherCookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId } });
      expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 409, code: "AI_AGENT_DISABLED" });

      const on = await ops().post("/api/ai/operations/agents/reference-l1/status", { status: "ACTIVE" });
      expect(on.body.status).toBe("ACTIVE");
      expect(await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_agent.enabled" } })).toMatchObject({ metadata: { agentKey: "reference-l1", version: 1 } });
      t.provider.script(fakeOutput({ summary: "ok" }));
      expect((await requestExecution(t, teacherCookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId } })).status).toBe(202);
    });

    it("mesma situação → 200 sem evento; DRAFT → 409; chave desconhecida → 404; status inválido → 400", async () => {
      const same = await ops().post("/api/ai/operations/agents/reference-l1/status", { status: "ACTIVE" });
      expect(same.status).toBe(200);
      expect(await t.prisma.auditEvent.count({ where: { type: { in: ["ai_agent.enabled", "ai_agent.disabled"] } } })).toBe(0);
      expect((await ops().post("/api/ai/operations/agents/reference-draft/status", { status: "ACTIVE" })).body.code).toBe("INVALID_STATE_TRANSITION");
      expect((await ops().post("/api/ai/operations/agents/nao-existe/status", { status: "ACTIVE" })).status).toBe(404);
      expect((await ops().post("/api/ai/operations/agents/reference-l1/status", { status: "DRAFT" })).status).toBe(400);
    });

    it("agente DEPRECATED → 409", async () => {
      await t.prisma.aiAgent.update({ where: { key: "reference-l1" }, data: { status: "DEPRECATED" } });
      const res = await ops().post("/api/ai/operations/agents/reference-l1/status", { status: "ACTIVE" });
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: "INVALID_STATE_TRANSITION" });
    });
  });

  it("006/US7-3 configuração desabilitada → agentes dela 503 AI_MODEL_UNAVAILABLE, com ai_model_config.disabled", async () => {
    const off = await ops().post("/api/ai/operations/model-configs/fake-default/status", { status: "DISABLED" });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ key: "fake-default", status: "DISABLED" });
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_model_config.disabled" } });
    expect(event).toMatchObject({ actorType: "USER", actorUserId: admin.id, targetType: "AI_MODEL_CONFIG" });
    expect(event.metadata).toEqual({ configKey: "fake-default", provider: "fake", model: "fake-model-1" });

    const teacherCookie = await loginAs(t, teacher);
    const refused = await requestExecution(t, teacherCookie, { agentKey: "reference-l1" });
    expect({ status: refused.status, code: refused.body.code }).toEqual({ status: 503, code: "AI_MODEL_UNAVAILABLE" });

    expect((await ops().post("/api/ai/operations/model-configs/fake-default/status", { status: "DISABLED" })).status).toBe(200);
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_model_config.disabled" } })).toBe(1);
    await ops().post("/api/ai/operations/model-configs/fake-default/status", { status: "ENABLED" });
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_model_config.enabled" } })).toBe(1);
    expect((await ops().post("/api/ai/operations/model-configs/nao-existe/status", { status: "ENABLED" })).status).toBe(404);
  });

  describe("006/US7-5 saúde do provedor, sem credencial", () => {
    it.each(["UP", "DOWN", "NOT_CONFIGURED"] as const)("provedor %s", async (health) => {
      t.provider.health = health;
      const res = await ops().get("/api/ai/operations/health");
      expect(res.status).toBe(200);
      expect(res.body.modelConfigs).toHaveLength(3);
      for (const config of res.body.modelConfigs) expect(config).toMatchObject({ provider: "fake", providerStatus: health });
      expect(res.body.checkedAt).toEqual(expect.any(String));
    });

    it("health check que falha → DOWN, sem a mensagem", async () => {
      const spy = vi.spyOn(t.provider, "healthCheck").mockRejectedValue(new Error("detalhe interno sk-segredo"));
      try {
        const res = await ops().get("/api/ai/operations/health");
        expect(res.body.modelConfigs[0].providerStatus).toBe("DOWN");
        expect(JSON.stringify(res.body)).not.toContain("sk-segredo");
      } finally {
        spy.mockRestore();
      }
    });
  });

  it.each(["TEACHER", "MANAGER", "STUDENT"] as const)("006/US7-7 %s → 403 em todas as rotas de operação", async (role) => {
    const client = api(t, { cookie: await loginAs(t, await createUser(t, { roles: [role] })) });
    const calls = [
      client.get("/api/ai/operations/health"),
      client.get("/api/ai/operations/metrics"),
      client.get("/api/ai/operations/agents"),
      client.get("/api/ai/operations/model-configs"),
      client.post("/api/ai/operations/agents/reference-l1/status", { status: "DISABLED" }),
      client.post("/api/ai/operations/model-configs/fake-default/status", { status: "DISABLED" }),
    ];
    for (const res of await Promise.all(calls)) expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "FORBIDDEN" });
    expect((await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" } })).status).toBe("ACTIVE");
  });
});
