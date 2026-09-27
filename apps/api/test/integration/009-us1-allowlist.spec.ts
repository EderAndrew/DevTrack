import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DecisionRequest } from "../../src/modules/ai/definitions/types";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { AiPolicyRegistry, type PolicyRoute } from "../../src/modules/ai/registry/ai-policy.registry";
import { fakeDecision, fakeOutput } from "../fixtures/ai/fake-model-provider";
import { FAKE_DECISION, REFERENCE_DECISION_TASK } from "../fixtures/ai/reference-decision";
import { REFERENCE_DEFAULT_TASK } from "../fixtures/ai/tasks";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";

const QUESTIONS: DecisionRequest["questions"] = {
  relevant: { type: "noul", instructions: "Is the text about the syllabus?", criteria: { true: "yes", false: "no" } },
};

describe("009/US1-1 009/SC-001 só modelos do catálogo, da allowlist e do modo da tarefa são chamados", () => {
  let t: AiTestApp;
  let teacher: TestUser;

  beforeAll(async () => {
    t = await createAiTestApp({ modelConfigs: [FAKE_DECISION], tasks: [REFERENCE_DECISION_TASK] });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
  });

  const taskId = async (key: string) => (await t.prisma.aiTask.findUniqueOrThrow({ where: { key } })).id;
  const configId = async (key: string) => (await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key } })).id;

  /** Marks `modelKey` approved for `taskKey` in the database, as if its evidence had passed. */
  async function approve(modelKey: string, taskKey: string) {
    await t.prisma.aiModelTaskApproval.create({
      data: {
        modelConfigId: await configId(modelKey),
        taskId: await taskId(taskKey),
        metrics: { accuracy: 1, schemaValidity: 1 },
        evaluatedAt: new Date(),
        evidence: "teste",
        valid: true,
        syncedAt: new Date(),
      },
    });
  }

  async function routeOf(taskKey: string): Promise<PolicyRoute> {
    const route = await t.get(AiPolicyRegistry).routeFor(await taskId(taskKey));
    if (!route || "unavailable" in route) throw new Error(`rota indisponível: ${JSON.stringify(route)}`);
    return route;
  }

  it("009/FR-001a uma tarefa de referência de decisão roda pelo provedor simulado, validada e com certeza", async () => {
    t.provider.scriptDecisions(fakeDecision({ relevant: { type: "noul", noul: 0.93 } }, { cost: { amount: "0.00003", currency: "USD" } }));
    const route = await routeOf(REFERENCE_DECISION_TASK.key);
    expect(route).toMatchObject({ primary: { key: FAKE_DECISION.key }, fallback: null, tier: "BASIC", reason: "ONLY_CANDIDATE" });

    const result = await t.get(ModelGateway).decide({
      route: { primary: route.primary, fallback: route.fallback },
      task: { timeoutMs: route.task.timeoutMs, minConfidence: route.policy.minConfidence! },
      request: { state: "Ementa de Programação Orientada a Objetos", questions: QUESTIONS },
      limits: t.config.ai.limits,
      deadline: new Date(Date.now() + 30_000),
      signal: new AbortController().signal,
    });
    expect(result.answers).toEqual({ relevant: { type: "noul", noul: 0.93 } });
    expect(t.provider.decisionRequests).toEqual([{ model: FAKE_DECISION.model, state: "Ementa de Programação Orientada a Objetos", questions: QUESTIONS }]);
    expect(t.provider.requests).toEqual([]);
  });

  it("um modelo de decisão, mesmo aprovado, nunca é escolhido para tarefa de geração", async () => {
    await approve(FAKE_DECISION.key, REFERENCE_DEFAULT_TASK.key);
    const route = await routeOf(REFERENCE_DEFAULT_TASK.key);
    expect([route.primary.key, route.fallback?.key]).not.toContain(FAKE_DECISION.key);
    expect(await t.get(AiPolicyRegistry).candidateIds(await taskId(REFERENCE_DEFAULT_TASK.key))).not.toContain(await configId(FAKE_DECISION.key));
  });

  it("um modelo de geração, mesmo aprovado, nunca é escolhido para tarefa de decisão", async () => {
    await approve("fake-default", REFERENCE_DECISION_TASK.key);
    await approve("fake-alt", REFERENCE_DECISION_TASK.key);
    const route = await routeOf(REFERENCE_DECISION_TASK.key);
    expect(route.primary.key).toBe(FAKE_DECISION.key);
    expect(route.fallback).toBeNull();
  });

  describe("uma configuração de modelo fora do catálogo no banco nunca é chamada", () => {
    let cookie: string;
    let subjectId: string;

    beforeEach(async () => {
      cookie = await loginAs(t, teacher);
      subjectId = (await createSubject(t, teacher.id)).id;
    });

    /** A row nobody's code declares: no tier, so not in the catalog (research H2). */
    const rogue = () =>
      t.prisma.aiModelConfig.create({
        data: { key: "fake-rogue", provider: "fake", model: "fake-model-rogue", status: "ENABLED", maxOutputTokens: 1000, timeoutMs: 30_000, definitionHash: "x", family: null, tier: null },
      });

    it("nem como override do administrador, nem aprovada: a execução usa o modelo da política", async () => {
      const row = await rogue();
      const task = await taskId(REFERENCE_DEFAULT_TASK.key);
      const admin = await createUser(t, { roles: ["ADMIN"] });
      await t.prisma.aiTaskOverride.create({ data: { taskId: task, modelConfigId: row.id, setByUserId: admin.id, setAt: new Date() } });
      await t.prisma.aiModelTaskApproval.create({
        data: { modelConfigId: row.id, taskId: task, metrics: { schemaValidity: 1 }, evaluatedAt: new Date(), evidence: "teste", valid: true, syncedAt: new Date() },
      });

      t.provider.script(fakeOutput({ summary: "ok" }));
      const res = await requestExecution(t, cookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId } });
      expect(res.status).toBe(202);
      await drain(t);

      const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id }, include: { modelConfig: true } });
      expect(execution).toMatchObject({ status: "COMPLETED", modelConfig: { key: "fake-default" }, selectionReason: "ONLY_CANDIDATE" });
      expect(t.provider.requests.map((request) => request.model)).not.toContain("fake-model-rogue");
      expect(await t.prisma.aiModelCall.count({ where: { modelConfigId: row.id } })).toBe(0);
    });

    it("com o nível forjado no banco, sem aprovação, ela não entra na escolha", async () => {
      await t.prisma.aiModelConfig.create({
        data: {
          key: "fake-forged",
          provider: "fake",
          family: "fake",
          tier: "BASIC",
          mode: "GENERATION",
          lifecycle: "PRODUCTION",
          model: "fake-model-forged",
          status: "ENABLED",
          maxOutputTokens: 1000,
          timeoutMs: 30_000,
          definitionHash: "x",
          priority: 99,
          capabilities: { structuredOutput: true, tools: true, vision: false, reasoning: false },
        },
      });
      const route = await routeOf(REFERENCE_DEFAULT_TASK.key);
      expect(route.primary.key).toBe("fake-default");

      t.provider.script(fakeOutput({ summary: "ok" }));
      await requestExecution(t, cookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId } });
      await drain(t);
      expect(t.provider.requests.map((request) => request.model)).not.toContain("fake-model-forged");
    });
  });
});
