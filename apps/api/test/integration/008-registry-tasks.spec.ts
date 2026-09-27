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

  it("grava cada tarefa com principal, fallback, parâmetros, máximo de tokens e tempo limite", async () => {
    const task = await t.prisma.aiTask.findUniqueOrThrow({
      where: { key: REFERENCE_DEFAULT_TASK.key },
      include: { primaryModelConfig: { select: { key: true } }, fallbackModelConfig: { select: { key: true } } },
    });
    expect(task).toMatchObject({
      primaryModelConfig: { key: REFERENCE_DEFAULT_TASK.primaryModelConfigKey },
      fallbackModelConfig: null,
      parameters: REFERENCE_DEFAULT_TASK.parameters ?? {},
      maxOutputTokens: REFERENCE_DEFAULT_TASK.maxOutputTokens,
      timeoutMs: REFERENCE_DEFAULT_TASK.timeoutMs,
    });
  });

  it("sincronizar de novo não muda nada; mudar a tarefa no código atualiza a linha", async () => {
    const base = referenceAiDefinitions(t.provider);
    expect((await syncWith(base)).changed).toBe(false);

    const changed = defineTask({ ...REFERENCE_DEFAULT_TASK, fallbackModelConfigKey: "fake-alt", maxOutputTokens: 900 });
    const summary = await syncWith({ ...base, tasks: base.tasks.map((task) => (task.key === changed.key ? changed : task)) });
    expect(summary.changed).toBe(true);
    const row = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: changed.key }, include: { fallbackModelConfig: { select: { key: true } } } });
    expect(row).toMatchObject({ maxOutputTokens: 900, fallbackModelConfig: { key: "fake-alt" } });
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

  it("o banco recusa fallback igual ao principal", async () => {
    const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_DEFAULT_TASK.key } });
    await expect(
      t.prisma.aiTask.update({ where: { id: task.id }, data: { fallbackModelConfigId: task.primaryModelConfigId } }),
    ).rejects.toThrow();
  });

  it("a tarefa de uma versão já usada não pode mudar (imutabilidade da 006)", async () => {
    const version = (await t.prisma.aiAgent.findUniqueOrThrow({ where: { key: "reference-l1" }, include: { currentVersion: true } })).currentVersion!;
    await t.prisma.aiAgentVersion.update({ where: { id: version.id }, data: { usedAt: new Date() } });
    const other = await t.prisma.aiTask.findFirstOrThrow({ where: { NOT: { id: version.taskId! } } });
    await expect(t.prisma.aiAgentVersion.update({ where: { id: version.id }, data: { taskId: other.id } })).rejects.toThrow();
  });
});
