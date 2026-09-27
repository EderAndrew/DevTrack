import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { fakeError, fakeOutput } from "../fixtures/ai/fake-model-provider";
import { FAKE_ALT, FAKE_DEFAULT } from "../fixtures/ai/model-configs";
import {
  ESCALATING_AGENT,
  ESCALATING_TASK,
  ESCALATION_DEFINITIONS,
  FAKE_STANDARD,
  NO_ESCALATION_AGENT,
  NO_ESCALATION_TASK,
  SKIP_TIER_TASK,
} from "../fixtures/ai/reference-escalation";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";

/** Sum of decimal strings with 6 places, as the database sums them. */
const sum = (...values: (string | null)[]) => (values.reduce((total, value) => total + Math.round(Number(value ?? 0) * 1_000_000), 0) / 1_000_000).toFixed(6);

describe("009/US6 custo por agente, tarefa, nível, família e modelo em \"Operação de IA\"", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let adminCookie: string;
  let escalatedId: string;
  let plainId: string;

  const admin = () => api(t, { cookie: adminCookie });
  const costOf = async (executionId: string, where: object = {}) =>
    (await t.prisma.aiModelCall.findMany({ where: { executionId, ...where }, orderBy: { sequence: "asc" } })).map((call) => call.estimatedCost?.toFixed(6) ?? null);

  beforeAll(async () => {
    t = await createAiTestApp(ESCALATION_DEFINITIONS);
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const cookie = await loginAs(t, teacher);
    adminCookie = await loginAs(t, await createUser(t, { roles: ["ADMIN"] }));
    const subjectId = (await createSubject(t, teacher.id)).id;
    const run = async (agentKey: string) => {
      const res = await requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId } });
      expect(res.status).toBe(202);
      await drain(t);
      return res.body.id as string;
    };
    // BASIC primary down → BASIC fallback answers an invalid output → one escalation to STANDARD.
    t.provider.scriptFor(FAKE_DEFAULT.model, fakeError("UNAVAILABLE"));
    t.provider.scriptFor(FAKE_ALT.model, fakeOutput({ unexpected: true }));
    t.provider.scriptFor(FAKE_STANDARD.model, fakeOutput({ summary: "ok" }));
    escalatedId = await run(ESCALATING_AGENT.key);
    t.provider.scriptFor(FAKE_DEFAULT.model);
    t.provider.script(fakeOutput({ summary: "ok" }));
    plainId = await run(NO_ESCALATION_AGENT.key);
  });

  describe("009/US6-1 009/US6-3 009/FR-020 009/SC-008 métricas por tarefa, nível e família, com fallback e escalonamento separados", () => {
    it("byTask: execuções, chamadas, tokens, custo, fallbacks e escalonamentos de cada tarefa", async () => {
      const res = await admin().get("/api/ai/operations/metrics?period=24h");
      expect(res.status).toBe(200);
      const byTask = Object.fromEntries(res.body.byTask.map((row: { taskKey: string }) => [row.taskKey, row]));
      expect(byTask[ESCALATING_TASK.key]).toMatchObject({
        agentKeys: [ESCALATING_AGENT.key],
        executions: 1,
        calls: 3,
        fallbacks: 1,
        escalations: 1,
        estimatedCost: sum(...(await costOf(escalatedId))),
        currency: "USD",
      });
      expect(byTask[NO_ESCALATION_TASK.key]).toMatchObject({ agentKeys: [NO_ESCALATION_AGENT.key], executions: 1, calls: 1, fallbacks: 0, escalations: 0, inputTokens: 120, outputTokens: 30 });
    });

    it("byTier: BASIC e STANDARD separados, com o custo de cada nível", async () => {
      const { body } = await admin().get("/api/ai/operations/metrics?period=24h");
      const byTier = Object.fromEntries(body.byTier.map((row: { tier: string }) => [row.tier, row]));
      expect(Object.keys(byTier).sort()).toEqual(["BASIC", "STANDARD"]);
      expect(byTier.BASIC).toMatchObject({ calls: 3 });
      expect(byTier.STANDARD).toMatchObject({ calls: 1, estimatedCost: sum(...(await costOf(escalatedId, { tier: "STANDARD" }))) });
    });

    it("byFamily: chamadas, custo e chamadas de fallback por família", async () => {
      const { body } = await admin().get("/api/ai/operations/metrics?period=24h");
      expect(body.byFamily).toEqual([expect.objectContaining({ family: "fake", calls: 4, fallbackCalls: 1 })]);
    });

    it("byAgent ganha os escalonamentos; byModel, o nível e a família da entrada do catálogo", async () => {
      const { body } = await admin().get("/api/ai/operations/metrics?period=24h");
      const agent = body.byAgent.find((row: { agentKey: string }) => row.agentKey === ESCALATING_AGENT.key);
      expect(agent).toMatchObject({ fallbacks: 1, escalations: 1 });
      expect(body.byAgent.find((row: { agentKey: string }) => row.agentKey === NO_ESCALATION_AGENT.key)).toMatchObject({ fallbacks: 0, escalations: 0 });
      expect(body.byModel).toContainEqual(expect.objectContaining({ model: FAKE_STANDARD.model, tier: "STANDARD", family: "fake", calls: 1 }));
      expect(body.byModel).toContainEqual(expect.objectContaining({ model: FAKE_DEFAULT.model, tier: "BASIC", family: "fake", calls: 2 }));
    });
  });

  describe("009/US6-2 009/FR-021 catálogo com aprovações, métricas medidas e custo real por execução", () => {
    it("GET /ai/operations/models: cada entrada com classificação, preço e, por tarefa, a qualidade ao lado do custo médio por execução", async () => {
      const res = await admin().get("/api/ai/operations/models?period=24h");
      expect(res.status).toBe(200);
      const models = Object.fromEntries(res.body.map((row: { key: string }) => [row.key, row]));
      expect(Object.keys(models).sort()).toEqual(["fake-advanced", "fake-alt", "fake-default", "fake-no-price", "fake-standard"]);

      expect(models[FAKE_STANDARD.key]).toMatchObject({
        family: "fake",
        model: FAKE_STANDARD.model,
        tier: "STANDARD",
        mode: "GENERATION",
        lifecycle: "PRODUCTION",
        status: "ENABLED",
        capabilities: FAKE_STANDARD.capabilities,
        contextWindow: FAKE_STANDARD.contextWindow,
        price: { inputPerMTok: "3", outputPerMTok: "15", currency: "USD" },
      });
      const standardOnEscalating = models[FAKE_STANDARD.key].approvals.find((a: { taskKey: string }) => a.taskKey === ESCALATING_TASK.key);
      expect(standardOnEscalating).toMatchObject({ valid: true, metrics: { schemaValidity: 1 }, avgCostPerExecution: sum(...(await costOf(escalatedId, { tier: "STANDARD" }))) });

      const defaultOnPlain = models[FAKE_DEFAULT.key].approvals.find((a: { taskKey: string }) => a.taskKey === NO_ESCALATION_TASK.key);
      expect(defaultOnPlain).toMatchObject({ valid: true, avgCostPerExecution: sum(...(await costOf(plainId))) });
      // An approved model with no execution of the task in the period: no real cost yet.
      const advancedOnSkip = models["fake-advanced"].approvals.find((a: { taskKey: string }) => a.taskKey === SKIP_TIER_TASK.key);
      expect(advancedOnSkip).toMatchObject({ valid: true, avgCostPerExecution: null });
      // Without a price, the model says so (the page shows "custo desconhecido").
      expect(models["fake-no-price"].price).toBeNull();
    });

    it("GET /ai/operations/tasks: a política de cada tarefa, a escolha atual com o motivo, os agentes e o override", async () => {
      const res = await admin().get("/api/ai/operations/tasks");
      expect(res.status).toBe(200);
      const tasks = Object.fromEntries(res.body.map((row: { key: string }) => [row.key, row]));
      expect(tasks[ESCALATING_TASK.key]).toEqual({
        key: ESCALATING_TASK.key,
        mode: "GENERATION",
        minimumTier: "BASIC",
        preferredTier: "BASIC",
        maxTier: "STANDARD",
        allowedFamilies: ["fake"],
        requiredCapabilities: ["structuredOutput"],
        fallback: "SAME_TIER",
        escalation: "ON_OUTPUT_INVALID",
        quality: { schemaValidity: 1 },
        agentKeys: expect.arrayContaining([ESCALATING_AGENT.key, "reference-one-call", "reference-escalating-l2"]),
        selection: { primaryKey: FAKE_DEFAULT.key, fallbackKey: FAKE_ALT.key, reason: "LOWEST_COST" },
        override: null,
      });
      expect(tasks[NO_ESCALATION_TASK.key]).toMatchObject({ maxTier: "BASIC", escalation: "NONE" });

      await t.prisma.aiModelTaskApproval.updateMany({ where: { task: { key: NO_ESCALATION_TASK.key } }, data: { valid: false } });
      const alt = await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: FAKE_ALT.key } });
      const escalating = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: ESCALATING_TASK.key } });
      const setAt = new Date("2026-09-27T10:00:00.000Z");
      await t.prisma.aiTaskOverride.create({ data: { taskId: escalating.id, modelConfigId: alt.id, setByUserId: teacher.id, setAt } });

      const after = Object.fromEntries((await admin().get("/api/ai/operations/tasks")).body.map((row: { key: string }) => [row.key, row]));
      expect(after[NO_ESCALATION_TASK.key].selection).toEqual({ unavailable: "NO_APPROVED_MODEL" });
      expect(after[ESCALATING_TASK.key]).toMatchObject({
        selection: { primaryKey: FAKE_ALT.key, reason: "OVERRIDE" },
        override: { modelConfigKey: FAKE_ALT.key, setAt: setAt.toISOString() },
      });
    });

    it("009/US5-4 um modelo DEPRECATED em uso aparece como aviso na tarefa (motivo DEPRECATED_ONLY)", async () => {
      await t.prisma.aiModelConfig.updateMany({ where: { key: { in: [FAKE_DEFAULT.key, FAKE_ALT.key] } }, data: { lifecycle: "DEPRECATED" } });
      const tasks = (await admin().get("/api/ai/operations/tasks")).body as { key: string; selection: object }[];
      expect(tasks.find((task) => task.key === ESCALATING_TASK.key)!.selection).toMatchObject({ reason: "DEPRECATED_ONLY" });
    });
  });
});
