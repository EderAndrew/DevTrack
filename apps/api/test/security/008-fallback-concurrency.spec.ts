import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineAgent } from "../../src/modules/ai/definitions/types";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { fakeError, fakeOutput } from "../fixtures/ai/fake-model-provider";
import { routedTask } from "../fixtures/ai/tasks";
import { REFERENCE_L1 } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiTestApp, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs } from "../helpers/factories";
import { testConfig } from "../helpers/test-app";

/** One logical call per execution (the model answers the output at once), primary → fallback. */
const FALLBACK_TASK = routedTask({
  key: "concurrency-fallback",
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
}, ["fake-default", "fake-alt"]);
const FALLBACK_AGENT = defineAgent({
  ...REFERENCE_L1,
  key: "concurrency-fallback-agent",
  name: "Agente com fallback",
  taskKey: FALLBACK_TASK.key,
  prompt: { ...REFERENCE_L1.prompt, key: "concurrency-fallback-agent" },
});

const RUNS = 8;

describe("008/SC-003 execuções simultâneas com o principal fora do ar", () => {
  let t: AiTestApp;

  beforeAll(async () => {
    const base = testConfig();
    t = await createAiTestApp({
      agents: [FALLBACK_AGENT],
      tasks: [FALLBACK_TASK],
      // Every run reaches the primary: the circuit (008-us6-circuit.spec.ts) stays closed here.
      config: {
        rateLimit: { ...base.rateLimit, aiExecutionsPerMinute: 1_000, aiAgentPerHour: 1_000 },
        ai: { ...base.ai, circuit: { ...base.ai.circuit, failureThreshold: 1_000 } },
      },
    });
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
  });
  afterAll(() => t.close());

  beforeEach(() => resetAiDb(t));

  it("cada chamada lógica tem no máximo duas pernas, um evento de fallback por chamada, e nenhum laço", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const cookie = await loginAs(t, teacher);
    const subjectId = (await createSubject(t, teacher.id)).id;
    t.provider.scriptFor("fake-model-1", fakeError("UNAVAILABLE"));
    t.provider.scriptFor("fake-model-2", fakeOutput({ summary: "ok" }));

    const ids: string[] = [];
    for (let i = 0; i < RUNS; i += 1) {
      const res = await requestExecution(t, cookie, { agentKey: FALLBACK_AGENT.key, resource: { type: "SUBJECT", id: subjectId } });
      expect(res.status).toBe(202);
      ids.push(res.body.id as string);
    }
    const worker = t.get(AiExecutionWorker);
    await Promise.all(Array.from({ length: RUNS }, () => worker.runOnce()));
    while ((await worker.runOnce()) > 0);

    const perLeg = t.config.ai.limits.maxRetries + 1;
    expect(t.provider.requests).toHaveLength(RUNS * (perLeg + 1));
    for (const id of ids) {
      const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id } });
      expect(execution).toMatchObject({ status: "COMPLETED", fallbackUsed: true, modelCalls: 2 });
      const calls = await t.prisma.aiModelCall.findMany({ where: { executionId: id }, orderBy: { sequence: "asc" } });
      expect(calls.map((call) => [call.sequence, call.isFallback, call.attempts])).toEqual([
        [1, false, perLeg],
        [2, true, 1],
      ]);
      expect(await t.prisma.auditEvent.count({ where: { type: "ai_execution.fallback_used", targetId: id } })).toBe(1);
    }
  });
});
