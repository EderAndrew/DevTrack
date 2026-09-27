import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_DEFINITIONS, defineAgent } from "../../src/modules/ai/definitions/types";
import { CircuitBreaker } from "../../src/modules/ai/gateway/circuit-breaker";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { fakeError, fakeOutput, FakeModelProvider } from "../fixtures/ai/fake-model-provider";
import { REFERENCE_L1 } from "../fixtures/ai/reference-agents";
import { routedTask } from "../fixtures/ai/tasks";
import { drain, requestExecution, resetAiDb } from "../helpers/ai";
import {
  curriculumTestDefinitions,
  getCurriculumAiStatus,
  seedProcessedDocument,
  TEST_CURRICULUM_FALLBACK_CONFIG,
  TEST_CURRICULUM_MODEL_CONFIG,
} from "../helpers/curriculum-ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, type TestApp, testConfig } from "../helpers/test-app";

/** One logical call per execution, so each execution is one leg on the primary's circuit. */
const ROUTED_TASK = routedTask({ key: "circuit-task", maxOutputTokens: 1000, timeoutMs: 30_000 }, ["fake-default", "fake-alt"]);
const ROUTED_AGENT = defineAgent({
  ...REFERENCE_L1,
  key: "circuit-agent",
  name: "Agente do circuito",
  taskKey: ROUTED_TASK.key,
  prompt: { ...REFERENCE_L1.prompt, key: "circuit-agent" },
});
/** The analysis's primary and, with a second approved BASIC model, its fallback (009 FR-012). */
const CURRICULUM_PRIMARY = TEST_CURRICULUM_MODEL_CONFIG;
const CURRICULUM_FALLBACK = TEST_CURRICULUM_FALLBACK_CONFIG;

describe("008/US6 circuito aberto por configuração de modelo", () => {
  const provider = new FakeModelProvider();
  let t: TestApp;
  let circuit: CircuitBreaker;
  let teacher: TestUser;
  let cookie: string;
  let subjectId: string;
  let threshold: number;

  beforeAll(async () => {
    const definitions = curriculumTestDefinitions(provider);
    definitions.agents = [...definitions.agents, ROUTED_AGENT];
    definitions.tasks = [...definitions.tasks, ROUTED_TASK];
    definitions.modelConfigs = [...definitions.modelConfigs, CURRICULUM_FALLBACK];
    const base = testConfig();
    t = await createTestApp({
      config: { rateLimit: { ...base.rateLimit, aiExecutionsPerMinute: 1_000, aiAgentPerHour: 1_000 } },
      overrides: [{ provide: AI_DEFINITIONS, useValue: definitions }],
    });
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
    circuit = t.get(CircuitBreaker);
    threshold = t.config.ai.circuit.failureThreshold;
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(Object.assign(t, { provider }));
    circuit.now = Date.now;
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  const request = (agentKey = ROUTED_AGENT.key) => requestExecution(t, cookie, { agentKey, resource: { type: "SUBJECT", id: subjectId } });
  const run = async (agentKey = ROUTED_AGENT.key) => {
    const res = await request(agentKey);
    expect(res.status).toBe(202);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id as string } });
  };
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const primaryDown = () => provider.scriptFor("fake-model-1", fakeError("UNAVAILABLE"));
  const primaryUp = () => provider.scriptFor("fake-model-1", fakeOutput({ summary: "ok" }));
  const fallbackUp = () => provider.scriptFor("fake-model-2", fakeOutput({ summary: "ok" }));
  const primaryCalls = () => provider.requests.filter((request) => request.model === "fake-model-1").length;
  const openFor = async (config: { key: string; provider: string; model: string }) => {
    for (let i = 0; i < threshold; i += 1) await circuit.recordTransientFailure(config);
  };

  it("008/US6-1 008/SC-007 falhas seguidas abrem o circuito uma vez; a execução seguinte vai direto ao fallback, sem chamar o principal", async () => {
    primaryDown();
    fallbackUp();
    for (let i = 0; i < threshold; i += 1) expect(await run()).toMatchObject({ status: "COMPLETED", fallbackUsed: true });
    expect(circuit.state("fake-default")).toBe("OPEN");
    const opened = await events("ai_circuit.opened");
    expect(opened).toHaveLength(1);
    const config = await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: "fake-default" } });
    expect(opened[0]).toMatchObject({
      actorType: "SYSTEM",
      targetType: "AI_MODEL_CONFIG",
      targetId: config.id,
      metadata: { configKey: "fake-default", provider: "fake", model: "fake-model-1", failures: threshold },
    });

    const before = primaryCalls();
    const next = await run();
    expect(next).toMatchObject({ status: "COMPLETED", fallbackUsed: true });
    expect(primaryCalls()).toBe(before);
    expect((await t.prisma.aiModelCall.findMany({ where: { executionId: next.id } })).map((call) => call.isFallback)).toEqual([true]);
    const fallback = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.fallback_used", targetId: next.id } });
    expect(fallback.metadata).toMatchObject({ reason: "CIRCUIT_OPEN", primaryErrorCode: null });
    expect(await events("ai_circuit.opened")).toHaveLength(1);
  });

  it("008/US6-1 sem fallback, com o circuito aberto: pedido novo 503 e execução na fila falha AI_MODEL_UNAVAILABLE, sem chamada", async () => {
    // reference-l1 routes to fake-default only.
    const queued = await request("reference-l1");
    expect(queued.status).toBe(202);
    await openFor({ key: "fake-default", provider: "fake", model: "fake-model-1" });
    primaryUp();
    await drain(t);
    expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: queued.body.id } })).toMatchObject({ status: "FAILED", errorCode: "AI_MODEL_UNAVAILABLE" });
    expect(primaryCalls()).toBe(0);
    const refused = await request("reference-l1");
    expect(refused.status).toBe(503);
    expect(refused.body.code).toBe("AI_MODEL_UNAVAILABLE");
  });

  it("008/US6-2 vencida a espera, uma chamada de teste: sucesso fecha o circuito, falha o reabre", async () => {
    await openFor({ key: "fake-default", provider: "fake", model: "fake-model-1" });
    fallbackUp();
    const later = (ms: number) => {
      circuit.now = () => Date.now() + ms;
    };

    // Probe that fails: the circuit opens again.
    later(t.config.ai.circuit.openSeconds * 1000);
    primaryDown();
    const failedProbe = await run();
    expect(failedProbe).toMatchObject({ status: "COMPLETED", fallbackUsed: true });
    expect(circuit.state("fake-default")).toBe("OPEN");
    expect(await events("ai_circuit.opened")).toHaveLength(2);
    // Only one probe: the primary was called once for it (with its retries), no more.
    expect(primaryCalls()).toBe(t.config.ai.limits.maxRetries + 1);

    // Probe that succeeds: the circuit closes.
    later(2 * t.config.ai.circuit.openSeconds * 1000);
    primaryUp();
    expect(await run()).toMatchObject({ status: "COMPLETED", fallbackUsed: false });
    expect(circuit.state("fake-default")).toBe("CLOSED");
    const closed = await events("ai_circuit.closed");
    expect(closed).toHaveLength(1);
    expect(closed[0]!.metadata).toEqual({ configKey: "fake-default", provider: "fake", model: "fake-model-1" });
  });

  it("GET /ai/operations/health mostra o circuito de cada configuração, e a disponibilidade da 007 o considera", async () => {
    const admin = await createUser(t, { roles: ["ADMIN"] });
    const ops = api(t, { cookie: await loginAs(t, admin) });
    const { document } = await seedProcessedDocument(t, teacher.id);
    const status = async () => (await getCurriculumAiStatus(t, cookie, document.id)).body.availability;

    await openFor({ key: CURRICULUM_PRIMARY.key, provider: "fake", model: TEST_CURRICULUM_MODEL_CONFIG.model });
    const health = (await ops.get("/api/ai/operations/health")).body as { modelConfigs: { key: string; circuit: string }[] };
    const circuitOf = (key: string) => health.modelConfigs.find((config) => config.key === key)?.circuit;
    expect(circuitOf(CURRICULUM_PRIMARY.key)).toBe("OPEN");
    expect(circuitOf(CURRICULUM_FALLBACK.key)).toBe("CLOSED");
    // The fallback still takes calls: past the model check (the test worker's timer is off, so PAUSED).
    expect(await status()).toBe("PAUSED");

    await openFor({ key: CURRICULUM_FALLBACK.key, provider: "fake", model: CURRICULUM_FALLBACK.model });
    expect(await status()).toBe("MODEL_UNAVAILABLE");
  });

  it("fallback também com o circuito aberto → AI_MODEL_UNAVAILABLE sem chamada", async () => {
    const queued = await request();
    expect(queued.status).toBe(202);
    await openFor({ key: "fake-default", provider: "fake", model: "fake-model-1" });
    await openFor({ key: "fake-alt", provider: "fake", model: "fake-model-2" });
    primaryUp();
    fallbackUp();
    await drain(t);
    expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: queued.body.id } })).toMatchObject({ status: "FAILED", errorCode: "AI_MODEL_UNAVAILABLE" });
    expect(provider.requests).toHaveLength(0);
    expect((await request()).status).toBe(503);
  });
});
