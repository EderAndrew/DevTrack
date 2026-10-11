import { readdirSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { productionAiDefinitions } from "../../src/modules/ai/definitions";
import { AI_DEFINITIONS, type AiDefinitions } from "../../src/modules/ai/definitions/types";
import { OpenRouterProvider } from "../../src/modules/ai/gateway/providers/openrouter.provider";
import { fakeOutput, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs } from "../helpers/factories";
import { api, createTestApp } from "../helpers/test-app";

const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * 006/SC-011: the automated suites never call a real model. Production registers no provider,
 * the test apps only the fake ones, the config has no provider credential, and a full AI flow
 * makes no request outside the machine.
 */
describe("006/SC-011 006/FR-015 006/FR-016 nenhum provedor real", () => {
  let t: AiTestApp;

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());

  it("007/FR-043 sem chave, a produção não registra provedor; só os agentes de domínio (007, 010, 011, 015) e o catálogo", () => {
    const production = productionAiDefinitions(t.config);
    expect(t.config.ai.openrouter.apiKey).toBeNull();
    expect(production.providers).toEqual([]);
    expect(production.agents.map((a) => [a.key, a.initialStatus])).toEqual([
      ["curriculum-agent", "DISABLED"],
      ["exercise-generator", "DISABLED"],
      ["work-generator", "DISABLED"],
      ["work-helper", "DISABLED"],
    ]);
    // 009: the catalog, every entry on OpenRouter.
    expect([...new Set(production.modelConfigs.map((c) => c.provider))]).toEqual(["openrouter"]);
    expect(production.tools.map((tool) => tool.key)).toEqual(["read-curriculum-document", "read-exercise-generation-request", "read-work-generation-request", "read-work-help-request"]);
  });

  it("008/US1-2 com a chave, a produção registra um provedor openrouter, e só ele", () => {
    const withKey = productionAiDefinitions({ ...t.config, ai: { ...t.config.ai, openrouter: { ...t.config.ai.openrouter, apiKey: "sk-or-teste-008-CHAVE-FALSA" } } });
    expect(withKey.providers.map((provider) => provider.key)).toEqual(["openrouter"]);
    expect(withKey.providers[0]).toBeInstanceOf(OpenRouterProvider);
  });

  it("007/FR-043 sem a chave, a app de produção inicia sem provedor", async () => {
    const production = await createTestApp();
    try {
      expect(production.get<AiDefinitions>(AI_DEFINITIONS).providers).toEqual([]);
      expect((await api(production).get("/api/health/live")).status).toBe(200);
    } finally {
      await production.close();
    }
  });

  it("008/US1-2 openrouter é a única chave de provedor real no código", () => {
    const dir = join(__dirname, "../../src/modules/ai/gateway/providers");
    const keys = readdirSync(dir)
      .filter((name) => name.endsWith(".provider.ts"))
      .flatMap((name) => [...readFileSync(join(dir, name), "utf8").matchAll(/readonly key = "([^"]+)"/g)].map((m) => m[1]));
    expect(keys).toEqual(["openrouter"]);
  });

  it("008/US1-2 a chave do E2E é fictícia e só aponta para o mock local (e2e/openrouter-mock.ts)", () => {
    const env = parseEnv(readFileSync(join(__dirname, "../../../web/e2e/.env.e2e"), "utf8"));
    expect(env.OPENROUTER_API_KEY).toMatch(/ficticia/);
    expect(new URL(env.OPENROUTER_BASE_URL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    expect(Object.keys(env).filter((key) => key.startsWith("ANTHROPIC_"))).toEqual([]);
  });

  it("o app de teste só tem provedores simulados (chaves fake*), e toda configuração aponta para eles", () => {
    const definitions = t.get<AiDefinitions>(AI_DEFINITIONS);
    expect(definitions.providers.length).toBeGreaterThan(0);
    expect(definitions.providers.map((p) => p.key).filter((key) => !key.startsWith("fake"))).toEqual([]);
    expect(definitions.modelConfigs.map((c) => c.provider).filter((key) => !key.startsWith("fake"))).toEqual([]);
    // The unit tests and the E2E instantiate OpenRouterProvider directly; no test app registers it.
    expect(definitions.providers.some((p) => p instanceof OpenRouterProvider)).toBe(false);
  });

  it("008/US1-2 config.schema.ts só declara a credencial do OpenRouter, e o teste roda sem ela", () => {
    const schema = readFileSync(join(__dirname, "../../src/platform/config/config.schema.ts"), "utf8");
    expect(schema.match(/\bAI_\w*(API_KEY|SECRET|TOKEN)\w*/g) ?? []).toEqual([]);
    expect(schema.match(/\b(ANTHROPIC|OPENAI|GEMINI|GOOGLE_AI|MISTRAL|AZURE_OPENAI)_\w*/g) ?? []).toEqual([]);
    // Not AI credentials: the app's own HMAC key and the e-mail provider's notice signing secret (017).
    const NON_AI_SECRETS = ["APP_HMAC_SECRET", "MAIL_NOTICE_SECRET"];
    expect([...new Set(schema.match(/\b\w+_(API_KEY|SECRET|TOKEN)\b/g))].filter((name) => !NON_AI_SECRETS.includes(name)).sort()).toEqual(["OPENROUTER_API_KEY"]);
    expect(Object.keys(t.config.ai).filter((key) => /key|secret|token|credential/i.test(key))).toEqual([]);
    expect(t.config.ai).not.toHaveProperty("anthropic");
    expect(t.config.ai.openrouter).toMatchObject({ apiKey: null, baseUrl: null });
  });

  describe("um fluxo completo de IA não sai da máquina", () => {
    const outside: string[] = [];
    let original: typeof globalThis.fetch;

    beforeEach(() => {
      original = globalThis.fetch;
      vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (!LOCAL.has(url.hostname)) outside.push(url.host);
        return original(input, init);
      });
    });
    afterEach(() => vi.unstubAllGlobals());

    it("pedido, ferramenta, proposta, decisão e operação: nenhuma chamada para fora do localhost", async () => {
      await resetAiDb(t);
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const cookie = await loginAs(t, teacher);
      const subjectId = (await createSubject(t, teacher.id)).id;
      const resource = { type: "SUBJECT", id: subjectId };

      t.provider.script(fakeToolCall("reference.read-subject", { subjectId }), fakeOutput({ summary: "ok" }));
      expect((await requestExecution(t, cookie, { agentKey: "reference-l1", resource })).status).toBe(202);
      await drain(t);
      t.provider.script(fakeOutput({ items: [{ id: "i1", label: "Item" }] }));
      const l2 = await requestExecution(t, cookie, { agentKey: "reference-l2", resource });
      await drain(t);
      const client = api(t, { cookie });
      const proposalId = (await client.get(`/api/ai/executions/${l2.body.id}`)).body.proposalId as string;
      expect((await client.post(`/api/ai/proposals/${proposalId}/decision`, { decision: "APPROVE" })).status).toBe(200);

      const admin = await createUser(t, { roles: ["ADMIN"] });
      const adminClient = api(t, { cookie: await loginAs(t, admin) });
      expect((await adminClient.get("/api/ai/operations/health")).status).toBe(200);

      expect(t.provider.requests.length).toBeGreaterThan(0);
      expect(outside).toEqual([]);
    });
  });
});
