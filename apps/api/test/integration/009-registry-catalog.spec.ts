import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AiDefinitions, type CatalogModel, defineCatalogModel, defineTask } from "../../src/modules/ai/definitions/types";
import { AiPolicyRegistry } from "../../src/modules/ai/registry/ai-policy.registry";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { AuditService } from "../../src/modules/audit/audit.service";
import { referenceAiDefinitions } from "../fixtures/ai/definitions";
import { FAKE_ALT, FAKE_DEFAULT, testApproval } from "../fixtures/ai/model-configs";
import { REFERENCE_ALT_TASK, REFERENCE_DEFAULT_TASK } from "../fixtures/ai/tasks";
import { type AiTestApp, createAiTestApp, resetAiDb } from "../helpers/ai";
import { captureLogs } from "../helpers/log-capture";

const logs = captureLogs();

/** A catalog entry the checks refuse: an OpenAI id declared as Anthropic (research H3). */
const MISMATCHED = defineCatalogModel({
  ...FAKE_DEFAULT,
  key: "anthropic-mismatch",
  family: "anthropic",
  model: "openai/gpt-6-luna",
  provider: "fake",
});

describe("009/FR-002 009/FR-006 009/FR-027 catálogo, políticas e aprovações no registro sincronizado", () => {
  let t: AiTestApp;
  let base: AiDefinitions;

  const syncWith = (definitions: AiDefinitions) => new AiRegistrySync(definitions, t.config, t.prisma, t.get(AuditService)).sync();
  const logged = (msg: string) => logs.lines().filter((line) => line.msg === msg);
  const withCatalog = (map: (entry: CatalogModel) => CatalogModel, extra: CatalogModel[] = []): AiDefinitions => ({
    ...base,
    modelConfigs: [...base.modelConfigs.map(map), ...extra],
  });

  beforeAll(async () => {
    t = await createAiTestApp({ logs });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    base = referenceAiDefinitions(t.provider);
    logs.clear();
  });

  it("grava cada entrada do catálogo com família, nível, modo, ciclo de vida, janela, capacidades e prioridade", async () => {
    const row = await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: FAKE_DEFAULT.key } });
    expect(row).toMatchObject({
      model: FAKE_DEFAULT.model,
      family: "fake",
      tier: "BASIC",
      mode: "GENERATION",
      lifecycle: "PRODUCTION",
      contextWindow: FAKE_DEFAULT.contextWindow,
      capabilities: FAKE_DEFAULT.capabilities,
      priority: 2,
    });
    const synced = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_registry.synced" }, orderBy: { occurredAt: "desc" } });
    expect(synced.metadata).toMatchObject({ catalogModels: base.modelConfigs.length });
  });

  it("grava a política de cada tarefa e as aprovações válidas pelos limiares da tarefa", async () => {
    const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_ALT_TASK.key } });
    expect(task).toMatchObject({ preferredTier: "BASIC", policy: { allowedFamilies: ["fake"], quality: { schemaValidity: 1 } } });

    const approvals = await t.prisma.aiModelTaskApproval.findMany({ where: { taskId: task.id }, include: { modelConfig: true } });
    expect(approvals.map((a) => ({ model: a.modelConfig.key, valid: a.valid }))).toEqual([{ model: FAKE_ALT.key, valid: true }]);
    expect(await t.get(AiPolicyRegistry).candidateIds(task.id)).toEqual([approvals[0]!.modelConfigId]);
  });

  it("sincronizar de novo não muda nada", async () => {
    expect((await syncWith(base)).changed).toBe(false);
  });

  it("009/FR-016 mudar o ciclo de vida no código audita uma vez", async () => {
    const deprecated = withCatalog((entry) => (entry.key === FAKE_ALT.key ? { ...entry, lifecycle: "DEPRECATED" } : entry));
    await syncWith(deprecated);
    await syncWith(deprecated);

    const events = await t.prisma.auditEvent.findMany({ where: { type: "ai_model_config.lifecycle_changed" } });
    expect(events).toHaveLength(1);
    expect(events[0]!.metadata).toEqual({ configKey: FAKE_ALT.key, from: "PRODUCTION", to: "DEPRECATED" });
    expect(await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: FAKE_ALT.key } })).toMatchObject({ lifecycle: "DEPRECATED" });
  });

  it("uma entrada inválida do catálogo não derruba a API: fica fora do catálogo e o motivo vai ao log", async () => {
    const summary = await syncWith(withCatalog((entry) => entry, [MISMATCHED]));

    expect(summary.catalogModels).toBe(base.modelConfigs.length);
    expect(await t.prisma.aiModelConfig.findUnique({ where: { key: MISMATCHED.key } })).toBeNull();
    expect(logged("ai.catalog_entry_rejected")).toEqual([expect.objectContaining({ configKey: MISMATCHED.key, reason: "FAMILY_MISMATCH" })]);
    // Only the key and the reason: never the model id.
    expect(logs.text()).not.toContain(MISMATCHED.model);
  });

  it("uma entrada que sai do catálogo perde o nível e nunca é escolhida, mas fica para o histórico", async () => {
    await syncWith({ ...base, modelConfigs: base.modelConfigs.filter((entry) => entry.key !== FAKE_ALT.key) });

    expect(await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: FAKE_ALT.key } })).toMatchObject({ tier: null, family: null });
    const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_ALT_TASK.key } });
    expect(await t.get(AiPolicyRegistry).availability(task.id)).toBe("NO_APPROVED_MODEL");
  });

  it("uma aprovação abaixo dos limiares da tarefa é gravada inválida, ignorada pela seleção e logada", async () => {
    const below = withCatalog((entry) =>
      entry.key === FAKE_ALT.key ? { ...entry, approvals: [testApproval(REFERENCE_ALT_TASK.key, { schemaValidity: 0.8 })] } : entry,
    );
    await syncWith(below);

    const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_ALT_TASK.key } });
    const approval = await t.prisma.aiModelTaskApproval.findFirstOrThrow({ where: { taskId: task.id } });
    expect(approval.valid).toBe(false);
    expect(logged("ai.approval_rejected")).toContainEqual(expect.objectContaining({ configKey: FAKE_ALT.key, task: task.key, reason: "BELOW_THRESHOLD" }));
    expect(await t.get(AiPolicyRegistry).availability(task.id)).toBe("NO_APPROVED_MODEL");
    expect(logged("ai.task_unavailable")).toContainEqual(expect.objectContaining({ task: task.key, reason: "NO_APPROVED_MODEL" }));
  });

  it.each([
    ["nível preferido abaixo do mínimo", { minimumTier: "STANDARD" as const }],
    ["família fora da allowlist", { allowedFamilies: ["mistral"] }],
    ["minConfidence numa tarefa de geração", { minConfidence: 0.9 }],
  ])("uma política inválida (%s) não derruba a API e só a tarefa fica indisponível com POLICY_INVALID", async (_name, change) => {
    const invalid = defineTask({ ...REFERENCE_ALT_TASK, ...change });
    await expect(syncWith({ ...base, tasks: base.tasks.map((task) => (task.key === invalid.key ? invalid : task)) })).resolves.toBeTruthy();

    const registry = t.get(AiPolicyRegistry);
    const alt = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_ALT_TASK.key } });
    const other = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_DEFAULT_TASK.key } });
    expect(await registry.availability(alt.id)).toBe("POLICY_INVALID");
    expect(await registry.availability(other.id)).toBeNull();
    expect(logged("ai.task_unavailable")).toContainEqual(expect.objectContaining({ task: alt.key, reason: "POLICY_INVALID" }));
  });
});
