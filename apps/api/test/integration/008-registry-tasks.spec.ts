import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuditService } from "../../src/modules/audit/audit.service";
import { type AiDefinitions, defineTask } from "../../src/modules/ai/definitions/types";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { referenceAiDefinitions } from "../fixtures/ai/definitions";
import { REFERENCE_DEFAULT_TASK } from "../fixtures/ai/tasks";
import { type AiTestApp, createAiTestApp, resetAiDb } from "../helpers/ai";

describe("008/FR-006 008/FR-007 tarefas no registro sincronizado", () => {
  let t: AiTestApp;

  const syncWith = (definitions: AiDefinitions) => new AiRegistrySync(definitions, t.config, t.prisma, t.get(AuditService)).sync();

  beforeAll(async () => {
    t = await createAiTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetAiDb(t));

  // 009: the fixed route became the task's model policy (research H5).
  it("grava cada tarefa com a política de modelos, parâmetros, máximo de tokens e tempo limite", async () => {
    const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_DEFAULT_TASK.key } });
    expect(task).toMatchObject({
      policy: { mode: "GENERATION", preferredTier: "BASIC", allowedFamilies: ["fake"], fallback: "NONE" },
      preferredTier: "BASIC",
      parameters: REFERENCE_DEFAULT_TASK.parameters ?? {},
      maxOutputTokens: REFERENCE_DEFAULT_TASK.maxOutputTokens,
      timeoutMs: REFERENCE_DEFAULT_TASK.timeoutMs,
    });
  });

  it("sincronizar de novo não muda nada; mudar a tarefa no código atualiza a linha", async () => {
    const base = referenceAiDefinitions(t.provider);
    expect((await syncWith(base)).changed).toBe(false);

    const changed = defineTask({ ...REFERENCE_DEFAULT_TASK, fallback: "SAME_TIER", maxOutputTokens: 900 });
    const summary = await syncWith({ ...base, tasks: base.tasks.map((task) => (task.key === changed.key ? changed : task)) });
    expect(summary.changed).toBe(true);
    const row = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: changed.key } });
    expect(row).toMatchObject({ maxOutputTokens: 900, policy: { fallback: "SAME_TIER" } });
  });

  it("uma versão de agente com tarefa grava task_id e deixa model_config_id vazio", async () => {
    const agent = await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" }, include: { currentVersion: { include: { task: true } } } });
    expect(agent.currentVersion).toMatchObject({ modelConfigId: null, task: { key: REFERENCE_DEFAULT_TASK.key } });
  });

  it("o banco exige exatamente um entre tarefa e configuração de modelo na versão de agente", async () => {
    const version = (await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" }, include: { currentVersion: true } })).currentVersion!;
    const config = await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: "fake-default" } });
    // A version synced before 008 has only the model config: still valid.
    await expect(t.prisma.aiAgentVersion.update({ where: { id: version.id }, data: { taskId: null, modelConfigId: config.id } })).resolves.toBeTruthy();
    await expect(t.prisma.aiAgentVersion.update({ where: { id: version.id }, data: { taskId: null, modelConfigId: null } })).rejects.toThrow();
    const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_DEFAULT_TASK.key } });
    await expect(t.prisma.aiAgentVersion.update({ where: { id: version.id }, data: { taskId: task.id, modelConfigId: config.id } })).rejects.toThrow();
  });

  it("o banco recusa um nível da tarefa diferente do da política", async () => {
    const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_DEFAULT_TASK.key } });
    await expect(t.prisma.aiTask.update({ where: { id: task.id }, data: { preferredTier: "ADVANCED" } })).rejects.toThrow(/policy_tier/);
  });

  it("a tarefa de uma versão já usada não pode mudar (imutabilidade da 006)", async () => {
    const version = (await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" }, include: { currentVersion: true } })).currentVersion!;
    await t.prisma.aiAgentVersion.update({ where: { id: version.id }, data: { usedAt: new Date() } });
    const other = await t.prisma.aiTask.findFirstOrThrow({ where: { NOT: { id: version.taskId! } } });
    await expect(t.prisma.aiAgentVersion.update({ where: { id: version.id }, data: { taskId: other.id } })).rejects.toThrow();
  });
});
