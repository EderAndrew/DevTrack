import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../../src/modules/audit/audit.service";
import { productionAiDefinitions } from "../../src/modules/ai/definitions";
import type { AgentDefinition, AiDefinitions } from "../../src/modules/ai/definitions/types";
import { AiRegistryError } from "../../src/modules/ai/registry/ai-definitions.check";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { ROLE_KEYS } from "../../src/modules/access-control/permissions";
import { referenceAiDefinitions } from "../fixtures/ai/definitions";
import { REFERENCE_AGENTS, REFERENCE_L1 } from "../fixtures/ai/reference-agents";
import { type AiTestApp, createAiTestApp, createAiExecution, resetAiDb } from "../helpers/ai";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb } from "../helpers/test-app";
import { AI_OPERATIONS, AI_TEACHER, ROLE_PERMISSIONS } from "../security/authorization-matrix";

const counts = async (t: AiTestApp) => ({
  agents: await t.prisma.aiAgent.count(),
  versions: await t.prisma.aiAgentVersion.count(),
  prompts: await t.prisma.aiPromptVersion.count(),
  schemas: await t.prisma.aiOutputSchemaVersion.count(),
  tools: await t.prisma.aiTool.count(),
  allowlist: await t.prisma.aiAgentTool.count(),
  configs: await t.prisma.aiModelConfig.count(),
});

describe("006/FR-008 registro sincronizado a partir do código", () => {
  let t: AiTestApp;

  /** A sync over other definitions, against the same database. */
  const syncWith = (definitions: AiDefinitions) =>
    new AiRegistrySync(definitions, t.config, t.prisma, t.get(AuditService)).sync();

  const withAgent = (agent: AgentDefinition): AiDefinitions => {
    const base = referenceAiDefinitions(t.provider);
    return { ...base, agents: base.agents.map((a) => (a.key === agent.key ? agent : a)) };
  };

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetAiDb(t));

  it("registra agentes, versões, instruções, esquemas, ferramentas, allowlist e configurações", async () => {
    expect(await counts(t)).toEqual({ agents: 5, versions: 5, prompts: 5, schemas: 5, tools: 4, allowlist: 14, configs: 3 });
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" }, include: { currentVersion: true } });
    expect(agent.status).toBe("ACTIVE");
    expect(agent.currentVersion).toMatchObject({ version: 1, riskLevel: "L1_READ_ONLY", requiredPermission: "ia.execucoes.visualizar" });
    expect((await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-draft" } })).status).toBe("DRAFT");
    expect((await t.prisma.aiTool.findUniqueOrThrow({ where: { key: "reference.read-subject" } })).outputFields).toEqual(["id", "name"]);
  });

  it("sincronizar de novo não duplica nada nem audita", async () => {
    const before = await counts(t);
    const events = await t.prisma.auditEvent.count({ where: { type: "ai_registry.synced" } });
    const summary = await t.get(AiRegistrySync).sync();
    expect(summary.changed).toBe(false);
    expect(await counts(t)).toEqual(before);
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_registry.synced" } })).toBe(events);
  });

  it("a situação operacional DISABLED é preservada; a situação inicial só vale na inserção", async () => {
    await t.prisma.aiAgent.update({ where: { key: "reference-l1" }, data: { status: "DISABLED" } });
    await t.prisma.aiModelConfig.update({ where: { key: "fake-alt" }, data: { status: "DISABLED" } });
    await t.get(AiRegistrySync).sync();
    expect((await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" } })).status).toBe("DISABLED");
    expect((await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: "fake-alt" } })).status).toBe("DISABLED");
  });

  it("006/US8-4 agente L3 é recusado na sincronização e pelo CHECK do banco", async () => {
    const l3 = { ...REFERENCE_L1, riskLevel: "L3_ACTION" } as unknown as AgentDefinition;
    await expect(syncWith(withAgent(l3))).rejects.toBeInstanceOf(AiRegistryError);
    await expect(
      t.prisma.$executeRawUnsafe(`UPDATE ai_agent_versions SET risk_level = 'L3_ACTION' WHERE version = 1`),
    ).rejects.toThrow(/no_l3/);
  });

  it("006/FR-048 limite do agente maior que o global é recusado", async () => {
    const greedy = { ...REFERENCE_L1, limits: { maxModelCalls: t.config.ai.limits.maxModelCalls + 1 } };
    await expect(syncWith(withAgent(greedy))).rejects.toThrow(/limit "maxModelCalls"/);
  });

  it("006/FR-010 versão nunca usada pode ser corrigida; versão usada que mudou impede a inicialização", async () => {
    const changed = { ...REFERENCE_L1, prompt: { ...REFERENCE_L1.prompt, systemInstructions: "Texto corrigido." } };
    await syncWith(withAgent(changed));
    const prompt = await t.prisma.aiPromptVersion.findFirstOrThrow({ where: { key: "reference-summary", version: 1 } });
    expect(prompt.systemInstructions).toBe("Texto corrigido.");

    await t.prisma.aiPromptVersion.update({ where: { id: prompt.id }, data: { usedAt: new Date() } });
    const again = { ...REFERENCE_L1, prompt: { ...REFERENCE_L1.prompt, systemInstructions: "Outro texto." } };
    const failure = await syncWith(withAgent(again)).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AiRegistryError);
    expect(String((failure as Error).message)).toMatch(/publish a new version/);
    expect(String((failure as Error).message)).not.toContain("Outro texto");
  });

  it("agente que sai do código vira DEPRECATED e não é mais o corrente", async () => {
    const base = referenceAiDefinitions(t.provider);
    const events = await t.prisma.auditEvent.count({ where: { type: "ai_registry.synced" } });
    const summary = await syncWith({ ...base, agents: base.agents.filter((a) => a.key !== "reference-l2") });
    expect(summary.deprecated).toBe(1);
    expect((await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l2" } })).status).toBe("DEPRECATED");
    expect(await t.prisma.auditEvent.count({ where: { type: "ai_registry.synced" } })).toBe(events + 1);
  });

  it("execuções antigas continuam ligadas às versões que usaram", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const execution = await createAiExecution(t, teacher.id, "reference-l1", { status: "COMPLETED" });
    const next = { ...REFERENCE_L1, version: 2, prompt: { ...REFERENCE_L1.prompt, version: 2, systemInstructions: "v2" } };
    await syncWith(withAgent(next));
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" }, include: { currentVersion: true } });
    expect(agent.currentVersion?.version).toBe(2);
    const old = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: execution.id }, include: { agentVersionRef: true } });
    expect(old.agentVersionRef.version).toBe(1);
  });

  it("007/FR-051 produção sincroniza curriculum-agent v3, (010) exercise-generator v1 e (011) work-generator v1 e (015) work-helper v1 DESABILITADOS, de forma idempotente", async () => {
    const production = productionAiDefinitions(t.config);
    await syncWith(production);
    const agents = await t.prisma.aiAgent.findMany({ where: { status: { not: "DEPRECATED" } }, include: { currentVersion: true }, orderBy: { key: "asc" } });
    expect(agents.map((a) => [a.key, a.status, a.currentVersion?.version])).toEqual([
      ["curriculum-agent", "DISABLED", 3],
      ["exercise-generator", "DISABLED", 1],
      ["work-generator", "DISABLED", 1],
      ["work-helper", "DISABLED", 1],
    ]);
    const tool = await t.prisma.aiTool.findUniqueOrThrow({ where: { key: "read-curriculum-document" } });
    expect(tool.status).toBe("ENABLED");
    // 009: the catalog of production, on OpenRouter; the agent's task names no model.
    const config = await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: "anthropic-basic" } });
    expect(config).toMatchObject({ provider: "openrouter", family: "anthropic", tier: "BASIC", lifecycle: "PRODUCTION" });

    const before = await counts(t);
    const events = await t.prisma.auditEvent.count();
    expect(await syncWith(production)).toMatchObject({ newVersions: 0 });
    expect(await counts(t)).toEqual(before);
    expect(await t.prisma.auditEvent.count()).toBe(events);
    expect(REFERENCE_AGENTS.length).toBeGreaterThan(0);
  });

  it("007/FR-051 depois de o administrador habilitar o agente, uma nova sincronização mantém ACTIVE", async () => {
    const production = productionAiDefinitions(t.config);
    // The app's own definitions stay the reference ones; the production agent joins through a sync.
    const reference = referenceAiDefinitions(t.provider);
    await syncWith({
      agents: [...reference.agents, ...production.agents],
      tools: [...reference.tools, ...production.tools],
      modelConfigs: [...reference.modelConfigs, ...production.modelConfigs],
      tasks: [...reference.tasks, ...production.tasks],
      families: reference.families,
      providers: reference.providers,
      resources: { ...reference.resources, ...production.resources },
    });
    const admin = await createUser(t, { roles: ["ADMIN"] });
    const enabled = await api(t, { cookie: await loginAs(t, admin) }).post("/api/ai/operations/agents/curriculum-agent/status", { status: "ACTIVE" });
    expect(enabled.status).toBe(200);
    await syncWith(production);
    expect(await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "curriculum-agent" } })).toMatchObject({ status: "ACTIVE" });
  });
});

describe("006/SC-013 006/FR-067 as features 001–005 continuam iguais", () => {
  it("com as definições de produção a API sobe sem agente ativo (007 curriculum-agent, 010 exercise-generator, 011 work-generator e 015 work-helper, desabilitados), e cada papel mantém as permissões da 001–005", async () => {
    const t = await createTestApp();
    try {
      // A clean database: an agent an earlier test enabled would keep ACTIVE through the sync.
      await resetDb(t.prisma);
      await t.get(AiRegistrySync).sync();
      expect(await t.prisma.aiAgent.count({ where: { status: { in: ["ACTIVE", "DRAFT"] } } })).toBe(0);
      const disabled = await t.prisma.aiAgent.findMany({ where: { status: "DISABLED" }, select: { key: true }, orderBy: { key: "asc" } });
      expect(disabled.map((a) => a.key)).toEqual(["curriculum-agent", "exercise-generator", "work-generator", "work-helper"]);
      const aiKeys = new Set<string>([...AI_TEACHER, ...AI_OPERATIONS]);
      for (const role of ROLE_KEYS) {
        const rows = await t.prisma.rolePermission.findMany({ where: { role: { key: role } }, select: { permission: { select: { key: true } } } });
        const before006 = rows.map((r) => r.permission.key).filter((key) => !aiKeys.has(key)).sort();
        expect(before006, role).toEqual(ROLE_PERMISSIONS[role].filter((key) => !aiKeys.has(key)).sort());
      }
    } finally {
      await t.close();
    }
  });
});
