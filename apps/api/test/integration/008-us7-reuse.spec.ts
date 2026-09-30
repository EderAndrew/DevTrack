import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AI_DEFINITIONS, type AiDefinitions } from "../../src/modules/ai/definitions/types";
import { CircuitBreaker } from "../../src/modules/ai/gateway/circuit-breaker";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { fakeError, FakeModelProvider, fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { REFERENCE_ROUTED, REFERENCE_ROUTED_TASK } from "../fixtures/ai/reference-routed";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { API_ROOT } from "../helpers/env";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { testConfig } from "../helpers/test-app";

const PER_HOUR = 4;
const THRESHOLD = 2;

describe("008/US7 um novo agente reaproveita o gateway sem implementar infraestrutura", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    const base = testConfig();
    t = await createAiTestApp({
      agents: [REFERENCE_ROUTED],
      tasks: [REFERENCE_ROUTED_TASK],
      config: {
        rateLimit: { ...base.rateLimit, aiExecutionsPerMinute: 1_000, aiAgentPerHour: PER_HOUR },
        ai: { ...base.ai, circuit: { ...base.ai.circuit, failureThreshold: THRESHOLD } },
      },
    });
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  const run = async () => {
    const res = await requestExecution(t, cookie, { agentKey: REFERENCE_ROUTED.key, resource: { type: "SUBJECT", id: subjectId } });
    if (res.status !== 202) return { status: res.status, body: res.body };
    await drain(t);
    return { status: 202, execution: await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id as string } }) };
  };

  it("008/US7-1 008/SC-010 com o principal falhando: fallback, uso, auditoria, circuito e limite do agente, sem código de infraestrutura no agente", async () => {
    t.provider.scriptFor("fake-model-1", fakeError("UNAVAILABLE"));
    t.provider.scriptFor("fake-model-2", fakeToolCall("reference.read-subject", { subjectId }), fakeOutput({ summary: "ok" }));

    // Fallback, usage and audit.
    const first = await run();
    expect(first.execution).toMatchObject({ status: "COMPLETED", taskKey: REFERENCE_ROUTED_TASK.key, fallbackUsed: true });
    const calls = await t.prisma.aiModelCall.findMany({ where: { executionId: first.execution!.id }, orderBy: { sequence: "asc" } });
    expect(calls.map((call) => [call.model, call.isFallback])).toEqual([
      ["fake-model-1", false],
      ["fake-model-2", true],
      ["fake-model-1", false],
      ["fake-model-2", true],
    ]);
    expect(calls.filter((call) => call.isFallback).every((call) => call.estimatedCost !== null && call.costSource === "PRICE")).toBe(true);
    const types = (await t.prisma.auditEvent.findMany({ where: { targetId: first.execution!.id } })).map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(["ai_execution.requested", "ai_execution.fallback_used", "ai_execution.completed"]));

    // The circuit: two failed primary legs opened it, so the next run skips the primary.
    expect(t.get(CircuitBreaker).state("fake-default")).toBe("OPEN");
    t.provider.scriptFor("fake-model-2", fakeToolCall("reference.read-subject", { subjectId }), fakeOutput({ summary: "ok" }));
    const before = t.provider.requests.filter((request) => request.model === "fake-model-1").length;
    expect((await run()).execution).toMatchObject({ status: "COMPLETED", fallbackUsed: true });
    expect(t.provider.requests.filter((request) => request.model === "fake-model-1")).toHaveLength(before);

    // The agent's hourly limit.
    for (let i = 2; i < PER_HOUR; i += 1) {
      t.provider.scriptFor("fake-model-2", fakeToolCall("reference.read-subject", { subjectId }), fakeOutput({ summary: "ok" }));
      expect((await run()).status).toBe(202);
    }
    const refused = await run();
    expect(refused.status).toBe(429);
    expect(await t.prisma.aiExecution.count({ where: { agentKey: REFERENCE_ROUTED.key } })).toBe(PER_HOUR);
  });

  it("008/US7-1 o arquivo do agente só declara definições: nada de gateway, uso, provedor nem fetch", () => {
    const source = readFileSync(join(API_ROOT, "test/fixtures/ai/reference-routed.ts"), "utf8");
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual(["../../../src/modules/ai/definitions/types", "zod"]);
    // The code, not its doc comment (which says what the gateway provides).
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bfetch\s*\(|gateway\/|usage\/|provider|circuit|rateLimit/i);
  });

  it("008/US7-2 os testes usam o provedor simulado, pelo mesmo contrato, e nunca um provedor real", () => {
    const definitions = t.get<AiDefinitions>(AI_DEFINITIONS);
    expect(definitions.providers.every((provider) => provider instanceof FakeModelProvider)).toBe(true);
    expect(definitions.modelConfigs.every((config) => config.provider.startsWith("fake"))).toBe(true);

    // The real provider is instantiated only by its own unit test, the secret scan and the
    // on-demand evals (007, 010, 011) — never registered by a test app.
    const NEEDLE = ["new OpenRouter", "Provider("].join("");
    const users: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".ts") && readFileSync(path, "utf8").includes(NEEDLE)) users.push(relative(API_ROOT, path));
      }
    };
    walk(join(API_ROOT, "test"));
    walk(join(API_ROOT, "src"));
    expect(users.sort()).toEqual(
      [
        "src/modules/ai/definitions/index.ts",
        "src/modules/ai/gateway/providers/openrouter.provider.spec.ts",
        "test/eval/curriculum-agent.eval.ts",
        "test/eval/exercise-generator.eval.ts",
        "test/eval/work-generator.eval.ts",
        "test/security/008-openrouter-secret.spec.ts",
      ].sort(),
    );
  });
});
