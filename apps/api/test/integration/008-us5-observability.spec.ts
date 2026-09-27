import { routedTask } from "../fixtures/ai/tasks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defineAgent } from "../../src/modules/ai/definitions/types";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { fakeError, fakeOutput, fakeServedModel } from "../fixtures/ai/fake-model-provider";
import { INSTRUCTIONS_MARKER, REFERENCE_L1 } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { captureLogs } from "../helpers/log-capture";
import { api } from "../helpers/test-app";

const TASK = routedTask({
  key: "observed-task",
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
}, ["fake-default", "fake-alt"]);
const AGENT = defineAgent({
  ...REFERENCE_L1,
  key: "observed-agent",
  name: "Agente observado",
  taskKey: TASK.key,
  prompt: { ...REFERENCE_L1.prompt, key: "observed-agent" },
});

const INPUT_MARKER = "MARCADOR-ENTRADA-008-US5";
const OUTPUT_MARKER = "MARCADOR-SAIDA-008-US5";
const SERVED = "fake-model-1-20260901";

describe("008/US5 o administrador vê tarefa, modelo servido, fallbacks e custo", () => {
  const logs = captureLogs();
  let t: AiTestApp;
  let teacher: TestUser;
  const ids: Record<"primary" | "fallback" | "failed", string> = { primary: "", fallback: "", failed: "" };

  beforeAll(async () => {
    t = await createAiTestApp({ logs, agents: [AGENT], tasks: [TASK] });
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const cookie = await loginAs(t, teacher);
    const subjectId = (await createSubject(t, teacher.id)).id;
    const run = async (key: keyof typeof ids) => {
      const res = await requestExecution(t, cookie, { agentKey: AGENT.key, resource: { type: "SUBJECT", id: subjectId }, input: { text: INPUT_MARKER } });
      expect(res.status).toBe(202);
      ids[key] = res.body.id as string;
      await drain(t);
    };

    // By the primary, which reports a dated model id.
    t.provider.scriptFor("fake-model-1", fakeServedModel(SERVED, fakeOutput({ summary: OUTPUT_MARKER })));
    await run("primary");
    // The primary is down: the fallback answers.
    t.provider.scriptFor("fake-model-1", fakeError("UNAVAILABLE"));
    t.provider.scriptFor("fake-model-2", fakeOutput({ summary: OUTPUT_MARKER }));
    await run("fallback");
    // A permanent error: no fallback, the execution fails.
    t.provider.scriptFor("fake-model-1", fakeError("INVALID_REQUEST"));
    await run("failed");
  });
  afterAll(() => t.close());

  it("008/US5-1 008/FR-019 métricas por agente (tarefa, fallbacks) e por modelo servido (falhas, fallbacks, duração, custo)", async () => {
    const admin = await createUser(t, { roles: ["ADMIN"] });
    const body = (await api(t, { cookie: await loginAs(t, admin) }).get("/api/ai/operations/metrics?period=24h")).body;

    expect(body.byAgent.find((row: { agentKey: string }) => row.agentKey === AGENT.key)).toMatchObject({
      taskKey: TASK.key,
      executions: 3,
      completed: 2,
      failed: 1,
      fallbacks: 1,
    });
    const byModel = Object.fromEntries(body.byModel.map((row: { model: string }) => [row.model, row]));
    expect(Object.keys(byModel).sort()).toEqual(["fake-model-1", "fake-model-2", SERVED].sort());
    // The primary's legs that failed: no served model, so the requested one.
    expect(byModel["fake-model-1"]).toMatchObject({ calls: 2, failedCalls: 2, fallbackCalls: 0 });
    expect(byModel[SERVED]).toMatchObject({ calls: 1, failedCalls: 0, fallbackCalls: 0, inputTokens: 120, outputTokens: 30, currency: "USD" });
    expect(byModel["fake-model-2"]).toMatchObject({ calls: 1, failedCalls: 0, fallbackCalls: 1, currency: "USD" });
    for (const row of body.byModel) expect(row.avgDurationMs).toEqual(expect.any(Number));
    // Failed calls report no usage, so no cost; the successful ones carry it.
    expect(byModel["fake-model-1"]).toMatchObject({ estimatedCost: null, inputTokens: null });
    for (const model of [SERVED, "fake-model-2"]) expect(byModel[model].estimatedCost).toMatch(/^\d+(\.\d+)?$/);
  });

  it("008/US5-2 008/SC-008 o registro de cada execução traz agente, tarefa, provedor, modelos pedido e servido, instruções, situação, tokens, latência, custo, fallback, erro, usuário e data", async () => {
    const record = async (id: string) => {
      const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id } });
      const calls = await t.prisma.aiModelCall.findMany({ where: { executionId: id }, orderBy: { sequence: "asc" } });
      return { execution, calls };
    };

    const primary = await record(ids.primary);
    expect(primary.execution).toMatchObject({
      agentKey: AGENT.key,
      taskKey: TASK.key,
      provider: "fake",
      model: "fake-model-1",
      promptVersion: 1,
      status: "COMPLETED",
      fallbackUsed: false,
      errorCode: null,
      requestedByUserId: teacher.id,
    });
    expect(primary.execution.createdAt).toBeInstanceOf(Date);
    expect(primary.execution.durationMs).toEqual(expect.any(Number));
    expect(primary.calls).toEqual([
      expect.objectContaining({ model: "fake-model-1", servedModel: SERVED, inputTokens: 120, outputTokens: 30, totalTokens: 150, costSource: "PRICE", isFallback: false }),
    ]);
    expect(primary.calls[0]!.durationMs).toEqual(expect.any(Number));
    expect(primary.calls[0]!.estimatedCost).not.toBeNull();

    const fallback = await record(ids.fallback);
    expect(fallback.execution).toMatchObject({ status: "COMPLETED", fallbackUsed: true, model: "fake-model-1" });
    expect(fallback.calls.map((call) => [call.model, call.servedModel, call.status, call.isFallback, call.errorCode])).toEqual([
      ["fake-model-1", null, "FAILED", false, "AI_PROVIDER_ERROR"],
      ["fake-model-2", "fake-model-2", "SUCCEEDED", true, null],
    ]);

    const failed = await record(ids.failed);
    expect(failed.execution).toMatchObject({ status: "FAILED", errorCode: "AI_PROVIDER_ERROR", fallbackUsed: false });
  });

  it("008/US5-3 logs ai.model_call estruturados, com correlação, tarefa, modelo servido e fallback, sem conteúdo", async () => {
    const lines = logs.lines().filter((line) => line.msg === "ai.model_call");
    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: ids.fallback } });
    const ofFallback = lines.filter((line) => line.executionId === ids.fallback);
    expect(ofFallback.map((line) => [line.configKey, line.fallback, line.status])).toEqual([
      ["fake-default", false, "FAILED"],
      ["fake-alt", true, "SUCCEEDED"],
    ]);
    for (const line of ofFallback) expect(line).toMatchObject({ correlationId: execution.correlationId, task: TASK.key });
    expect(lines.find((line) => line.executionId === ids.primary)).toMatchObject({ servedModel: SERVED, fallback: false });

    const text = logs.text();
    for (const marker of [INPUT_MARKER, OUTPUT_MARKER, INSTRUCTIONS_MARKER]) expect(text.includes(marker), marker).toBe(false);
  });
});
