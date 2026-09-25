import { AI_FINAL_EXECUTION_STATUSES } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { AiOperationsService } from "../../src/modules/ai/operations/ai-operations.service";
import { FAKE_PROVIDER_CREDENTIAL, fakeDelay, fakeEmpty, fakeError, fakeOutput, fakeText } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";

const CALL_TIMEOUT_MS = 200;

/**
 * 006/SC-009: the 10 resilience scenarios end in a final status with a normalized code, and no
 * answer to the client carries a provider message, stack or credential.
 */
describe("006/SC-009 cenários de resiliência", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    const base = testConfig().ai;
    t = await createAiTestApp({ config: { ai: { ...base, limits: { ...base.limits, modelCallTimeoutMs: CALL_TIMEOUT_MS } } } });
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  const request = () => requestExecution(t, cookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId } });

  /** Each scenario leaves one execution and returns its id. */
  const scenarios: [string, () => Promise<string>, string, string | null][] = [
    ["provedor indisponível", async () => { t.provider.script(fakeError("UNAVAILABLE")); const { body } = await request(); await drain(t); return body.id; }, "FAILED", "AI_PROVIDER_ERROR"],
    ["limite de taxa do provedor", async () => { t.provider.script(fakeError("RATE_LIMITED")); const { body } = await request(); await drain(t); return body.id; }, "FAILED", "AI_RATE_LIMITED"],
    ["tempo esgotado", async () => { t.provider.script(fakeDelay(CALL_TIMEOUT_MS * 5, fakeOutput({ summary: "x" }))); const { body } = await request(); await drain(t); return body.id; }, "TIMED_OUT", "AI_TIMEOUT"],
    ["resposta vazia", async () => { t.provider.script(fakeEmpty()); const { body } = await request(); await drain(t); return body.id; }, "FAILED", "AI_OUTPUT_VALIDATION_FAILED"],
    ["resposta malformada", async () => { t.provider.script(fakeText("{ quebrado")); const { body } = await request(); await drain(t); return body.id; }, "FAILED", "AI_OUTPUT_PARSE_FAILED"],
    [
      "trabalho entregue duas vezes",
      async () => {
        t.provider.script(fakeOutput({ summary: "uma vez" }));
        const { body } = await request();
        const worker = t.get(AiExecutionWorker);
        await Promise.all([worker.runOnce(), worker.runOnce()]);
        expect(t.provider.requests).toHaveLength(1);
        return body.id;
      },
      "COMPLETED",
      null,
    ],
    ["nova tentativa", async () => { t.provider.script(fakeError("UNAVAILABLE"), fakeOutput({ summary: "depois" })); const { body } = await request(); await drain(t); return body.id; }, "COMPLETED", null],
    [
      "cancelamento",
      async () => {
        const { body } = await request();
        await api(t, { cookie }).post(`/api/ai/executions/${body.id}/cancel`, {});
        await drain(t);
        return body.id;
      },
      "CANCELLED",
      "AI_EXECUTION_CANCELLED",
    ],
    [
      "agente desabilitado",
      async () => {
        const { body } = await request();
        const admin = await createUser(t, { roles: ["ADMIN"] });
        await t.get(AiOperationsService).changeAgentStatus({ userId: admin.id, requestId: null }, "reference-l1", "DISABLED");
        await drain(t);
        return body.id;
      },
      "CANCELLED",
      "AI_AGENT_DISABLED",
    ],
    [
      "modelo desabilitado",
      async () => {
        const { body } = await request();
        await t.prisma.aiModelConfig.update({ where: { key: "fake-default" }, data: { status: "DISABLED" } });
        await drain(t);
        return body.id;
      },
      "FAILED",
      "AI_MODEL_UNAVAILABLE",
    ],
  ];

  it("são exatamente os 10 cenários do SC-009", () => {
    expect(scenarios).toHaveLength(10);
  });

  it.each(scenarios)("%s → estado final com código normalizado, sem mensagem do provedor na resposta", async (_label, scenario, status, errorCode) => {
    const id = await scenario();
    const res = await api(t, { cookie }).get(`/api/ai/executions/${id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status, errorCode });
    expect(AI_FINAL_EXECUTION_STATUSES).toContain(res.body.status);
    const text = JSON.stringify(res.body);
    for (const leak of [FAKE_PROVIDER_CREDENTIAL, "ProviderError", "stack", "fake-model-1", "\"fake\""]) expect(text).not.toContain(leak);
  });

  it("006/FR-052 11º pedido de execução no minuto → 429", async () => {
    const limit = t.config.rateLimit.aiExecutionsPerMinute;
    for (let i = 0; i < limit; i += 1) expect((await request()).status).toBe(202);
    const blocked = await request();
    expect({ status: blocked.status, code: blocked.body.code }).toEqual({ status: 429, code: "RATE_LIMITED" });
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(await t.prisma.aiExecution.count()).toBe(limit);
  });

  it("corpo JSON acima do limite do servidor → 400 VALIDATION_ERROR no formato padrão, não 500", async () => {
    const huge = await api(t, { cookie }).post("/api/ai/executions", { agentKey: "reference-l1", idempotencyKey: crypto.randomUUID(), input: { text: "a".repeat(t.config.ai.limits.maxInputBytes + 128 * 1024) } });
    expect(huge.body).toEqual({ statusCode: 400, code: "VALIDATION_ERROR", message: expect.any(String) });
    expect(huge.status).toBe(400);
  });
});
