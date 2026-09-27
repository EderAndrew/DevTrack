import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineAgent } from "../../src/modules/ai/definitions/types";
import { fakeCost, fakeOutput, fakeServedModel } from "../fixtures/ai/fake-model-provider";
import { routedTask } from "../fixtures/ai/tasks";
import { REFERENCE_L1 } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";

/** A task with a fallback, and one on the config without a price. */
const ROUTED_TASK = routedTask({
  key: "route-test",
  parameters: { temperature: 0 },
  maxOutputTokens: 2000,
  timeoutMs: 30_000,
}, ["fake-default", "fake-alt"]);
const NO_PRICE_TASK = routedTask({ key: "route-no-price", maxOutputTokens: 1000, timeoutMs: 30_000 }, ["fake-no-price"]);

const ROUTED_AGENT = defineAgent({
  ...REFERENCE_L1,
  key: "route-agent",
  name: "Agente roteado",
  taskKey: ROUTED_TASK.key,
  prompt: { ...REFERENCE_L1.prompt, key: "route-agent" },
});
const NO_PRICE_AGENT = defineAgent({
  ...REFERENCE_L1,
  key: "route-no-price-agent",
  name: "Agente sem preço",
  taskKey: NO_PRICE_TASK.key,
  prompt: { ...REFERENCE_L1.prompt, key: "route-no-price-agent" },
});

describe("008/FR-006 a execução guarda a rota da tarefa, e cada chamada o modelo servido e o custo", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    t = await createAiTestApp({ agents: [ROUTED_AGENT, NO_PRICE_AGENT], tasks: [ROUTED_TASK, NO_PRICE_TASK] });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  const request = (agentKey = ROUTED_AGENT.key) => requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId } });

  const calls = (executionId: string) => t.prisma.aiModelCall.findMany({ where: { executionId }, orderBy: { sequence: "asc" } });

  it("o pedido grava tarefa, principal e fallback, e o evento de pedido os cita", async () => {
    const res = await request();
    expect(res.status).toBe(202);
    const row = await t.prisma.aiExecution.findUniqueOrThrow({
      where: { id: res.body.id },
      include: { modelConfig: { select: { key: true } }, fallbackModelConfig: { select: { key: true } } },
    });
    expect(row).toMatchObject({
      taskKey: "route-test",
      modelConfig: { key: "fake-default" },
      fallbackModelConfig: { key: "fake-alt" },
      fallbackUsed: false,
      provider: "fake",
      model: "fake-model-1",
    });
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.requested", targetId: res.body.id } });
    expect(event.metadata).toMatchObject({ modelConfigKey: "fake-default", taskKey: "route-test", fallbackModelConfigKey: "fake-alt" });
  });

  it("sem fallback na tarefa, o pedido grava fallback vazio", async () => {
    const res = await request("reference-l1");
    const row = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ taskKey: "reference-default", fallbackModelConfigId: null });
  });

  it("cada chamada grava o modelo servido, is_fallback falso e o custo pelo preço (cost_source PRICE)", async () => {
    t.provider.script(fakeOutput({ summary: "ok" }));
    const res = await request();
    await drain(t);
    expect(await calls(res.body.id)).toEqual([
      expect.objectContaining({ model: "fake-model-1", servedModel: "fake-model-1", isFallback: false, costSource: "PRICE", currency: "USD" }),
    ]);
    expect((await calls(res.body.id))[0]!.estimatedCost!.toString()).toBe("0.00018");
  });

  it("008/FR-017 o custo informado pelo provedor tem precedência sobre o preço (cost_source PROVIDER)", async () => {
    t.provider.script(fakeServedModel("fake-model-1-2026", fakeCost("0.0042", fakeOutput({ summary: "ok" }))));
    const res = await request();
    await drain(t);
    const [call] = await calls(res.body.id);
    expect(call).toMatchObject({ servedModel: "fake-model-1-2026", costSource: "PROVIDER", currency: "USD" });
    expect(call!.estimatedCost!.toString()).toBe("0.0042");
  });

  it("008/FR-017 sem custo do provedor e sem preço, o custo e a origem ficam vazios", async () => {
    t.provider.script(fakeOutput({ summary: "ok" }));
    const res = await request(NO_PRICE_AGENT.key);
    await drain(t);
    expect(await calls(res.body.id)).toEqual([expect.objectContaining({ estimatedCost: null, currency: null, costSource: null })]);
  });
});
