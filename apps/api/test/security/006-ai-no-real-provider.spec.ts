import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { productionAiDefinitions } from "../../src/modules/ai/definitions";
import { AI_DEFINITIONS, type AiDefinitions } from "../../src/modules/ai/definitions/types";
import { AnthropicProvider } from "../../src/modules/ai/gateway/providers/anthropic.provider";
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

  it("007/FR-043 sem chave, a produção não registra provedor; só o curriculum-agent e sua configuração", () => {
    const production = productionAiDefinitions(t.config);
    expect(t.config.ai.anthropic.apiKey).toBeNull();
    expect(production.providers).toEqual([]);
    expect(production.agents.map((a) => [a.key, a.initialStatus])).toEqual([["curriculum-agent", "DISABLED"]]);
    expect(production.modelConfigs.map((c) => c.provider)).toEqual(["anthropic"]);
    expect(production.tools.map((tool) => tool.key)).toEqual(["read-curriculum-document"]);
  });

  it("007/FR-043 com a chave, a produção registra um provedor anthropic, e só ele", () => {
    const withKey = productionAiDefinitions({ ...t.config, ai: { ...t.config.ai, anthropic: { apiKey: "sk-ant-teste-007-CHAVE-FALSA", baseUrl: null } } });
    expect(withKey.providers.map((provider) => provider.key)).toEqual(["anthropic"]);
    expect(withKey.providers[0]).toBeInstanceOf(AnthropicProvider);
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

  it("007/FR-043 anthropic é a única chave de provedor real no código", () => {
    const dir = join(__dirname, "../../src/modules/ai/gateway/providers");
    const keys = readdirSync(dir)
      .filter((name) => name.endsWith(".provider.ts"))
      .flatMap((name) => [...readFileSync(join(dir, name), "utf8").matchAll(/readonly key = "([^"]+)"/g)].map((m) => m[1]));
    expect(keys).toEqual(["anthropic"]);
  });

  it("o app de teste só tem provedores simulados (chaves fake*), e toda configuração aponta para eles", () => {
    const definitions = t.get<AiDefinitions>(AI_DEFINITIONS);
    expect(definitions.providers.length).toBeGreaterThan(0);
    expect(definitions.providers.map((p) => p.key).filter((key) => !key.startsWith("fake"))).toEqual([]);
    expect(definitions.modelConfigs.map((c) => c.provider).filter((key) => !key.startsWith("fake"))).toEqual([]);
  });

  it("007/FR-043 config.schema.ts só declara a credencial da Anthropic, e o teste roda sem ela", () => {
    const schema = readFileSync(join(__dirname, "../../src/platform/config/config.schema.ts"), "utf8");
    expect(schema.match(/\bAI_\w*(API_KEY|SECRET|TOKEN)\w*/g) ?? []).toEqual([]);
    expect(schema.match(/\b(OPENAI|GEMINI|GOOGLE_AI|MISTRAL|AZURE_OPENAI)\w*/g) ?? []).toEqual([]);
    expect([...new Set(schema.match(/\bANTHROPIC_\w+/g))].sort()).toEqual(["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"]);
    expect(Object.keys(t.config.ai).filter((key) => /key|secret|token|credential/i.test(key))).toEqual([]);
    expect(t.config.ai.anthropic).toEqual({ apiKey: null, baseUrl: null });
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
