import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import { AuditService } from "../../src/modules/audit/audit.service";
import { type AgentDefinition, AI_DEFINITIONS, type AiDefinitions } from "../../src/modules/ai/definitions/types";
import { AiEvaluationError, AiEvaluationStore } from "../../src/modules/ai/evaluation/ai-evaluation.store";
import { AiRegistryError } from "../../src/modules/ai/registry/ai-definitions.check";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { referenceAiDefinitions } from "../fixtures/ai/definitions";
import { FakeModelProvider, fakeOutput } from "../fixtures/ai/fake-model-provider";
import { FAKE_DEFAULT } from "../fixtures/ai/model-configs";
import { REFERENCE_L1, REFERENCE_L2 } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs } from "../helpers/factories";
import { createTestApp, type TestApp } from "../helpers/test-app";

/** v2 of the reference L1 agent: new instructions and a task on another model config; same key. */
const L1_V2: AgentDefinition = {
  ...REFERENCE_L1,
  version: 2,
  taskKey: "reference-alt",
  prompt: { ...REFERENCE_L1.prompt, version: 2, systemInstructions: "Resuma o recurso autorizado, versão 2." },
};

/**
 * 006/US8: versions are immutable once used, a model or provider swap is a config change only,
 * and every execution keeps the versions it used. A "restart" is a second app over the same
 * database, whose startup syncs other definitions.
 */
describe("006/US8 agentes, instruções, modelos e esquemas versionados e trocáveis", () => {
  let t: AiTestApp;
  let cookie: string;
  let subjectId: string;

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
  });

  const definitionsWith = (provider: FakeModelProvider, change: (base: AiDefinitions) => Partial<AiDefinitions>): AiDefinitions => {
    const base = referenceAiDefinitions(provider);
    return { ...base, ...change(base) };
  };
  /** A model config's id (008: an agent version reaches its config through its task). */
  const configId = async (key: string) => (await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key } })).id;
  const withAgent = (agent: AgentDefinition) => (base: AiDefinitions) => ({
    agents: base.agents.map((a) => (a.key === agent.key ? agent : a)),
  });

  /** Another app over the same database; its startup syncs `definitions`. */
  async function restartWith<T>(definitions: AiDefinitions, run: (app: TestApp) => Promise<T>): Promise<T> {
    const app = await createTestApp({ overrides: [{ provide: AI_DEFINITIONS, useValue: definitions }] });
    try {
      return await run(app);
    } finally {
      await app.close();
    }
  }

  async function runL1(app: TestApp, provider: FakeModelProvider): Promise<string> {
    provider.script(fakeOutput({ summary: "ok" }));
    const res = await requestExecution(app, cookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId } });
    expect(res.status).toBe(202);
    await drain(app);
    return res.body.id as string;
  }

  const recorded = (id: string) =>
    t.prisma.aiExecution.findUniqueOrThrow({
      where: { id },
      select: {
        status: true,
        agentVersion: true,
        promptVersion: true,
        provider: true,
        model: true,
        agentVersionRef: { select: { version: true } },
        promptVersionRef: { select: { version: true, systemInstructions: true } },
        modelConfig: { select: { key: true } },
      },
    });

  it("006/US8-1 006/SC-008 a execução antiga mantém v1 e fake-default; a nova registra v2 e fake-alt, no mesmo agente", async () => {
    const oldId = await runL1(t, t.provider);
    const agentBefore = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" } });
    const v1 = await t.prisma.aiAgentVersion.findFirstOrThrow({ where: { agentId: agentBefore.id, version: 1 } });

    const provider = new FakeModelProvider();
    const newId = await restartWith(definitionsWith(provider, withAgent(L1_V2)), (app) => runL1(app, provider));

    expect(await recorded(oldId)).toEqual({
      status: "COMPLETED",
      agentVersion: 1,
      promptVersion: 1,
      provider: "fake",
      model: "fake-model-1",
      agentVersionRef: { version: 1 },
      promptVersionRef: { version: 1, systemInstructions: REFERENCE_L1.prompt.systemInstructions },
      modelConfig: { key: "fake-default" },
    });
    expect(await recorded(newId)).toEqual({
      status: "COMPLETED",
      agentVersion: 2,
      promptVersion: 2,
      provider: "fake",
      model: "fake-model-2",
      agentVersionRef: { version: 2 },
      promptVersionRef: { version: 2, systemInstructions: L1_V2.prompt.systemInstructions },
      modelConfig: { key: "fake-alt" },
    });
    expect(provider.requests[0]).toMatchObject({ model: "fake-model-2" });
    expect(provider.requests[0]!.system).toContain("versão 2");

    const agentAfter = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" }, include: { currentVersion: true } });
    expect(agentAfter.id).toBe(agentBefore.id);
    expect(agentAfter.currentVersion?.version).toBe(2);
    expect(await t.prisma.aiAgentVersion.findUniqueOrThrow({ where: { id: v1.id } })).toEqual(v1);
  });

  it("006/US8-1 uma execução pedida na v1 e ainda na fila não roda com a v2: termina FAILED sem chamar o modelo", async () => {
    const res = await requestExecution(t, cookie, { agentKey: "reference-l1", resource: { type: "SUBJECT", id: subjectId } });
    const provider = new FakeModelProvider();
    await restartWith(definitionsWith(provider, withAgent(L1_V2)), (app) => drain(app));
    expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id }, select: { status: true, errorCode: true, promptVersion: true } })).toEqual({
      status: "FAILED",
      errorCode: "AI_AGENT_NOT_FOUND",
      promptVersion: 1,
    });
    expect(provider.requests).toHaveLength(0);
  });

  describe("006/US8-2 006/FR-010 versão usada é imutável", () => {
    const syncWith = (definitions: AiDefinitions) =>
      new AiRegistrySync(definitions, t.config, t.prisma, t.get(AuditService)).onApplicationBootstrap();

    it("mudar o texto da v1 já usada faz a inicialização falhar, sem alterar o registro", async () => {
      await runL1(t, t.provider);
      const changed = { ...REFERENCE_L1, prompt: { ...REFERENCE_L1.prompt, systemInstructions: "Texto novo sem nova versão." } };
      const failure = await syncWith(definitionsWith(t.provider, withAgent(changed))).catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(AiRegistryError);
      expect((failure as Error).message).not.toContain("Texto novo");

      const prompt = await t.prisma.aiPromptVersion.findFirstOrThrow({ where: { key: REFERENCE_L1.prompt.key, version: 1 } });
      expect(prompt.systemInstructions).toBe(REFERENCE_L1.prompt.systemInstructions);
    });

    it("mudar o esquema de saída da v1 já usada também faz a inicialização falhar", async () => {
      await runL1(t, t.provider);
      const changed = { ...REFERENCE_L1, output: { version: 1, schema: z.strictObject({ resumo: z.string() }) } };
      await expect(syncWith(definitionsWith(t.provider, withAgent(changed)))).rejects.toBeInstanceOf(AiRegistryError);
    });

    it.each([
      ["ai_prompt_versions", `UPDATE ai_prompt_versions SET system_instructions = 'alterado' WHERE key = 'reference-summary' AND version = 1`],
      ["ai_output_schema_versions", `UPDATE ai_output_schema_versions SET json_schema = '{}' WHERE used_at IS NOT NULL`],
      ["ai_agent_versions", `UPDATE ai_agent_versions SET on_tool_denied = 'continue' WHERE used_at IS NOT NULL`],
    ])("UPDATE direto em %s usada → recusado pela trigger", async (_table, sql) => {
      await runL1(t, t.provider);
      await expect(t.prisma.$executeRawUnsafe(sql)).rejects.toThrow(/immutable/);
    });

    it("uma versão nunca usada pode ser corrigida, pelo código e por UPDATE direto", async () => {
      await runL1(t, t.provider);
      const fixed = { ...REFERENCE_L2, prompt: { ...REFERENCE_L2.prompt, systemInstructions: "Proponha itens (corrigido)." } };
      await syncWith(definitionsWith(t.provider, withAgent(fixed)));
      const prompt = await t.prisma.aiPromptVersion.findFirstOrThrow({ where: { key: REFERENCE_L2.prompt.key, version: 1 } });
      expect(prompt).toMatchObject({ systemInstructions: "Proponha itens (corrigido).", usedAt: null });
      await expect(t.prisma.$executeRawUnsafe(`UPDATE ai_prompt_versions SET system_instructions = 'outro' WHERE id = '${prompt.id}'::uuid`)).resolves.toBe(1);
    });
  });

  it("006/US8-3 006/SC-008 a configuração aponta para outro provedor (fake-b): o agente funciona sem mudança e a execução registra o provedor usado", async () => {
    const oldId = await runL1(t, t.provider);
    const agentBefore = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" }, select: { currentVersionId: true } });

    const fakeB = new FakeModelProvider("fake-b");
    const swapped = definitionsWith(fakeB, (base) => ({
      modelConfigs: base.modelConfigs.map((c) => (c.key === FAKE_DEFAULT.key ? { ...c, provider: "fake-b", model: "fake-b-model" } : c)),
    }));
    expect(swapped.agents.find((a) => a.key === "reference-l1")).toBe(REFERENCE_L1);
    const newId = await restartWith(swapped, (app) => runL1(app, fakeB));

    expect(await recorded(newId)).toMatchObject({ status: "COMPLETED", agentVersion: 1, provider: "fake-b", model: "fake-b-model", modelConfig: { key: "fake-default" } });
    expect(await t.prisma.aiModelCall.findFirstOrThrow({ where: { executionId: newId }, select: { provider: true, model: true } })).toEqual({ provider: "fake-b", model: "fake-b-model" });
    expect(fakeB.requests).toHaveLength(1);
    expect(await recorded(oldId)).toMatchObject({ provider: "fake", model: "fake-model-1" });
    expect(await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" }, select: { currentVersionId: true } })).toEqual(agentBefore);
  });

  it("006/US8-4 definição L3 → a sincronização recusa, e um INSERT direto é recusado pelo CHECK", async () => {
    const l3 = { ...REFERENCE_L1, version: 3, riskLevel: "L3_ACTION" } as unknown as AgentDefinition;
    const sync = new AiRegistrySync(definitionsWith(t.provider, withAgent(l3)), t.config, t.prisma, t.get(AuditService));
    await expect(sync.sync()).rejects.toThrow(/L3_ACTION is not accepted/);

    const { id: _id, createdAt: _c, usedAt: _used, limits, ...v1 } = await t.prisma.aiAgentVersion.findFirstOrThrow({
      where: { agent: { key: "reference-l1" }, version: 1 },
    });
    await expect(
      t.prisma.aiAgentVersion.create({ data: { ...v1, limits: limits ?? {}, version: 3, riskLevel: "L3_ACTION" } }),
    ).rejects.toThrow(/no_l3/);
    expect(await t.prisma.aiAgentVersion.count({ where: { riskLevel: "L3_ACTION" } })).toBe(0);
  });

  describe("006/US8-5 006/FR-064 casos e resultados de avaliação", () => {
    const CASE = { key: "resumo-basico", version: 1, inputRef: "fixtures/ai/eval/resumo-basico.json", expected: { hasSummary: true, maxWords: 50 } };

    it("recordCase é idempotente por (agente, chave, versão) e recusa o mesmo par com outro conteúdo", async () => {
      const store = t.get(AiEvaluationStore);
      const first = await store.recordCase("reference-l1", CASE);
      const again = await store.recordCase("reference-l1", { ...CASE, expected: { maxWords: 50, hasSummary: true } });
      expect(first.created).toBe(true);
      expect(again).toEqual({ id: first.id, created: false });
      expect(await t.prisma.aiEvaluationCase.count()).toBe(1);

      await expect(store.recordCase("reference-l1", { ...CASE, expected: { hasSummary: false } })).rejects.toBeInstanceOf(AiEvaluationError);
      expect((await store.recordCase("reference-l1", { ...CASE, version: 2, expected: { hasSummary: false } })).created).toBe(true);
      await expect(store.recordCase("nao-existe", CASE)).rejects.toBeInstanceOf(AiEvaluationError);
    });

    it("recordResult liga o resultado às versões de agente e instruções e à configuração, pronto para comparar versões", async () => {
      const store = t.get(AiEvaluationStore);
      const { id: caseId } = await store.recordCase("reference-l1", CASE);
      const v1 = await t.prisma.aiAgentVersion.findFirstOrThrow({ where: { agent: { key: "reference-l1" }, version: 1 } });
      await store.recordResult(caseId, {
        agentVersionId: v1.id,
        promptVersionId: v1.promptVersionId,
        modelConfigId: await configId("fake-default"),
        passed: true,
        metrics: { score: 0.9, latencyMs: 120 },
      });

      await new AiRegistrySync(definitionsWith(t.provider, withAgent(L1_V2)), t.config, t.prisma, t.get(AuditService)).sync();
      const v2 = await t.prisma.aiAgentVersion.findFirstOrThrow({ where: { agent: { key: "reference-l1" }, version: 2 } });
      await store.recordResult(caseId, { agentVersionId: v2.id, promptVersionId: v2.promptVersionId, modelConfigId: await configId("fake-alt"), passed: false, metrics: { score: 0.4 } });

      const results = await t.prisma.aiEvaluationResult.findMany({
        where: { caseId },
        orderBy: { ranAt: "asc" },
        select: { passed: true, metrics: true, provider: true, model: true, agentVersion: { select: { version: true } }, promptVersion: { select: { version: true } }, modelConfig: { select: { key: true } } },
      });
      expect(results).toEqual([
        { passed: true, metrics: { score: 0.9, latencyMs: 120 }, provider: "fake", model: "fake-model-1", agentVersion: { version: 1 }, promptVersion: { version: 1 }, modelConfig: { key: "fake-default" } },
        { passed: false, metrics: { score: 0.4 }, provider: "fake", model: "fake-model-2", agentVersion: { version: 2 }, promptVersion: { version: 2 }, modelConfig: { key: "fake-alt" } },
      ]);
    });

    it("métricas só numéricas, e versões de outro agente ou instruções que não são da versão → recusadas", async () => {
      const store = t.get(AiEvaluationStore);
      const { id: caseId } = await store.recordCase("reference-l1", CASE);
      const l1 = await t.prisma.aiAgentVersion.findFirstOrThrow({ where: { agent: { key: "reference-l1" } } });
      const l2 = await t.prisma.aiAgentVersion.findFirstOrThrow({ where: { agent: { key: "reference-l2" } } });
      const valid = { agentVersionId: l1.id, promptVersionId: l1.promptVersionId, modelConfigId: await configId("fake-default"), passed: true };

      await expect(store.recordResult(caseId, { ...valid, metrics: { saida: "texto do modelo" } as never })).rejects.toBeInstanceOf(ZodError);
      await expect(store.recordResult(caseId, { ...valid, agentVersionId: l2.id, promptVersionId: l2.promptVersionId })).rejects.toBeInstanceOf(AiEvaluationError);
      await expect(store.recordResult(caseId, { ...valid, promptVersionId: l2.promptVersionId })).rejects.toBeInstanceOf(AiEvaluationError);
      expect(await t.prisma.aiEvaluationResult.count()).toBe(0);
    });
  });
});
