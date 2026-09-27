import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ModelLifecycle } from "../../src/modules/ai/definitions/model-families";
import { type AiDefinitions, type CatalogModel, defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { AiPolicyRegistry } from "../../src/modules/ai/registry/ai-policy.registry";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { AuditService } from "../../src/modules/audit/audit.service";
import { referenceAiDefinitions } from "../fixtures/ai/definitions";
import { fakeError, fakeOutput } from "../fixtures/ai/fake-model-provider";
import { FAKE_ALT, FAKE_DEFAULT, testApproval } from "../fixtures/ai/model-configs";
import { REFERENCE_ROUTED, REFERENCE_ROUTED_TASK } from "../fixtures/ai/reference-routed";
import { REFERENCE_ALT_TASK } from "../fixtures/ai/tasks";
import { type AiTestApp, createAiTestApp, drain, requestExecution, resetAiDb } from "../helpers/ai";
import { createSubject, createUser, loginAs } from "../helpers/factories";
import { captureLogs } from "../helpers/log-capture";

const logs = captureLogs();

/**
 * A new catalog entry for `reference-routed`, first in the policy's order: the task's `typicalUsage`
 * is zeroed (costs tie), so its higher `priority` puts it ahead of `fake-default`.
 */
const newEntry = (key: string, model: string, lifecycle: ModelLifecycle, approvals = [testApproval(REFERENCE_ROUTED_TASK.key)]): CatalogModel =>
  defineCatalogModel({ ...FAKE_DEFAULT, key, model, lifecycle, priority: 3, approvals });

describe("009/US5 ciclo de vida do catálogo e portão de qualidade", () => {
  let t: AiTestApp;
  let base: AiDefinitions;
  let cookie: string;
  let subjectId: string;

  const syncWith = (definitions: AiDefinitions) => new AiRegistrySync(definitions, t.config, t.prisma, t.get(AuditService)).sync();
  /** The base definitions with `extra` entries and `change` applied to the existing ones. */
  const catalog = (extra: CatalogModel[] = [], change: (entry: CatalogModel) => CatalogModel = (entry) => entry): AiDefinitions => ({
    ...base,
    modelConfigs: [...base.modelConfigs.map(change), ...extra],
  });
  const lifecycleOf = (key: string, lifecycle: ModelLifecycle) => (entry: CatalogModel) => (entry.key === key ? { ...entry, lifecycle } : entry);
  const taskId = async (key = REFERENCE_ROUTED_TASK.key) => (await t.prisma.aiTask.findUniqueOrThrow({ where: { key } })).id;
  const route = async (key = REFERENCE_ROUTED_TASK.key) => t.get(AiPolicyRegistry).routeFor(await taskId(key));
  const logged = (msg: string) => logs.lines().filter((line) => line.msg === msg);
  const lifecycleEvents = () => t.prisma.auditEvent.findMany({ where: { type: "ai_model_config.lifecycle_changed" }, orderBy: { id: "asc" } });

  async function run() {
    const res = await requestExecution(t, cookie, { agentKey: REFERENCE_ROUTED.key, resource: { type: "SUBJECT", id: subjectId } });
    expect(res.status).toBe(202);
    await drain(t);
    return t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.id }, include: { modelConfig: true } });
  }

  beforeAll(async () => {
    t = await createAiTestApp({ logs, agents: [REFERENCE_ROUTED], tasks: [REFERENCE_ROUTED_TASK] });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    const reference = referenceAiDefinitions(t.provider);
    base = { ...reference, agents: [...reference.agents, REFERENCE_ROUTED], tasks: [...reference.tasks, REFERENCE_ROUTED_TASK] };
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    subjectId = (await createSubject(t, teacher.id)).id;
    logs.clear();
  });

  describe("009/US5-1 009/US5-2 009/FR-016 009/FR-017 009/FR-018 só PRODUCTION aprovado atende; a promoção é da equipe, no catálogo", () => {
    it("CANDIDATE e depois EVALUATING, aprovados e primeiros na ordem, nunca são escolhidos; promovido a PRODUCTION, passa a ser", async () => {
      await syncWith(catalog([newEntry("fake-new", "fake-model-new", "CANDIDATE")]));
      expect(await route()).toMatchObject({ primary: { key: FAKE_DEFAULT.key }, fallback: { key: FAKE_ALT.key } });

      await syncWith(catalog([newEntry("fake-new", "fake-model-new", "EVALUATING")]));
      expect(await route()).toMatchObject({ primary: { key: FAKE_DEFAULT.key } });
      t.provider.script(fakeOutput({ summary: "ok" }));
      await run();
      expect(t.provider.requests.map((request) => request.model)).not.toContain("fake-model-new");

      await syncWith(catalog([newEntry("fake-new", "fake-model-new", "PRODUCTION")]));
      expect(await route()).toMatchObject({ primary: { key: "fake-new" }, reason: "LOWEST_COST" });
      expect((await lifecycleEvents()).map((event) => event.metadata)).toEqual([
        { configKey: "fake-new", from: "CANDIDATE", to: "EVALUATING" },
        { configKey: "fake-new", from: "EVALUATING", to: "PRODUCTION" },
      ]);
    });

    it("PRODUCTION com a avaliação abaixo dos limiares da tarefa: a aprovação fica inválida, é logada e o modelo não atende", async () => {
      await syncWith(catalog([newEntry("fake-new", "fake-model-new", "PRODUCTION", [testApproval(REFERENCE_ROUTED_TASK.key, { schemaValidity: 0.9 })])]));
      expect(await route()).toMatchObject({ primary: { key: FAKE_DEFAULT.key } });
      expect(logged("ai.approval_rejected")).toContainEqual(expect.objectContaining({ configKey: "fake-new", task: REFERENCE_ROUTED_TASK.key, reason: "BELOW_THRESHOLD" }));
      const approval = await t.prisma.aiModelTaskApproval.findFirstOrThrow({ where: { modelConfig: { key: "fake-new" } } });
      expect(approval).toMatchObject({ valid: false });
    });

    it("sem avaliação registrada para a tarefa, PRODUCTION não basta", async () => {
      await syncWith(catalog([newEntry("fake-new", "fake-model-new", "PRODUCTION", [])]));
      expect(await route()).toMatchObject({ primary: { key: FAKE_DEFAULT.key } });
    });

    it.each([
      ["PRODUCTION → CANDIDATE", "CANDIDATE"],
      ["PRODUCTION → EVALUATING", "EVALUATING"],
    ] as const)("transição inválida (%s) é recusada na checagem: a entrada sai do catálogo, sem auditoria de mudança", async (_name, to) => {
      await syncWith(catalog([], lifecycleOf(FAKE_ALT.key, to)));
      expect(logged("ai.catalog_entry_rejected")).toContainEqual(expect.objectContaining({ configKey: FAKE_ALT.key, reason: "LIFECYCLE_TRANSITION_INVALID" }));
      expect(await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: FAKE_ALT.key } })).toMatchObject({ lifecycle: "PRODUCTION", tier: null });
      expect(await lifecycleEvents()).toEqual([]);
      expect(await route()).toMatchObject({ primary: { key: FAKE_DEFAULT.key }, fallback: null });
    });

    it("DEPRECATED → PRODUCTION é recusada: volta por uma nova avaliação (EVALUATING)", async () => {
      await syncWith(catalog([], lifecycleOf(FAKE_ALT.key, "DEPRECATED")));
      await syncWith(catalog([], lifecycleOf(FAKE_ALT.key, "PRODUCTION")));
      expect(logged("ai.catalog_entry_rejected")).toContainEqual(expect.objectContaining({ configKey: FAKE_ALT.key, reason: "LIFECYCLE_TRANSITION_INVALID" }));

      await syncWith(catalog([], lifecycleOf(FAKE_ALT.key, "EVALUATING")));
      await syncWith(catalog([], lifecycleOf(FAKE_ALT.key, "PRODUCTION")));
      expect(await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: FAKE_ALT.key } })).toMatchObject({ lifecycle: "PRODUCTION", tier: "BASIC" });
      expect((await lifecycleEvents()).map((event) => [event.metadata as { from: string }].map(({ from }) => from)[0])).toEqual(["PRODUCTION", "DEPRECATED", "EVALUATING"]);
    });
  });

  describe("009/US5-3 DISABLED nunca é selecionado: nem principal chamado, nem fallback, nem override", () => {
    const disable = (key: string) => t.prisma.aiModelConfig.update({ where: { key }, data: { status: "DISABLED" } });

    it("o principal desabilitado nunca é chamado: a execução vai ao fallback do mesmo nível", async () => {
      await disable(FAKE_DEFAULT.key);
      t.provider.script(fakeOutput({ summary: "ok" }));
      const execution = await run();
      expect(execution.status).toBe("COMPLETED");
      expect(t.provider.requests.map((request) => request.model)).toEqual([FAKE_ALT.model]);
    });

    it("um desabilitado nunca vira fallback", async () => {
      await disable(FAKE_ALT.key);
      expect(await route()).toMatchObject({ primary: { key: FAKE_DEFAULT.key }, fallback: null });
      t.provider.script(fakeError("UNAVAILABLE"));
      await run();
      expect(t.provider.requests.map((request) => request.model)).not.toContain(FAKE_ALT.model);
    });

    it("o override do administrador para um modelo desabilitado é ignorado: vale a política", async () => {
      const admin = await createUser(t, { roles: ["ADMIN"] });
      const alt = await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: FAKE_ALT.key } });
      await t.prisma.aiTaskOverride.create({ data: { taskId: await taskId(), modelConfigId: alt.id, setByUserId: admin.id, setAt: new Date() } });
      expect(await route()).toMatchObject({ primary: { key: FAKE_ALT.key }, reason: "OVERRIDE" });

      await disable(FAKE_ALT.key);
      expect(await route()).toMatchObject({ primary: { key: FAKE_DEFAULT.key }, fallback: null, overrideIgnored: true });
      t.provider.script(fakeOutput({ summary: "ok" }));
      const execution = await run();
      expect(execution).toMatchObject({ status: "COMPLETED", modelConfig: { key: FAKE_DEFAULT.key } });
      expect(execution.selectionReason).not.toBe("OVERRIDE");
    });
  });

  describe("009/US5-4 DEPRECATED só na falta de outro aprovado do mesmo nível, com aviso", () => {
    it("com um PRODUCTION aprovado, o DEPRECATED não é o principal", async () => {
      await syncWith(catalog([], lifecycleOf(FAKE_DEFAULT.key, "DEPRECATED")));
      expect(await route()).toMatchObject({ primary: { key: FAKE_ALT.key }, reason: "ONLY_CANDIDATE" });
      // No warning for this task; `reference-default`, whose only model is that one, does get it.
      expect(logged("ai.model_deprecated_in_use").map((line) => line.task)).toEqual(["reference-default"]);
    });

    it("sem outro, a tarefa usa o DEPRECATED, com o motivo na execução e o aviso no log da inicialização", async () => {
      await syncWith(catalog([], lifecycleOf(FAKE_ALT.key, "DEPRECATED")));
      expect(await route(REFERENCE_ALT_TASK.key)).toMatchObject({ primary: { key: FAKE_ALT.key }, reason: "DEPRECATED_ONLY" });
      expect(logged("ai.model_deprecated_in_use")).toEqual([expect.objectContaining({ task: REFERENCE_ALT_TASK.key, configKey: FAKE_ALT.key })]);
      // Only the task and the catalog key: never the model id.
      expect(logs.text()).not.toContain(FAKE_ALT.model);
    });
  });

  it("009/US5-5 009/FR-019 009/SC-007 uma nova versão entra no catálogo e muda a escolha sem tocar em agente ou política; as execuções antigas mantêm a versão", async () => {
    t.provider.script(fakeOutput({ summary: "ok" }));
    const before = await run();
    expect(before).toMatchObject({ model: FAKE_DEFAULT.model, modelConfig: { key: FAKE_DEFAULT.key } });
    const agentVersions = await t.prisma.aiAgentVersion.count();
    const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_ROUTED_TASK.key } });

    // The new version as a new entry; the old one deprecated in the same change (a reviewed catalog edit).
    await syncWith(catalog([newEntry("fake-default-v2", "fake-model-1-v2", "PRODUCTION")], lifecycleOf(FAKE_DEFAULT.key, "DEPRECATED")));
    expect(await route()).toMatchObject({ primary: { key: "fake-default-v2" } });
    expect(await t.prisma.aiAgentVersion.count()).toBe(agentVersions);
    expect(await t.prisma.aiTask.findUniqueOrThrow({ where: { key: REFERENCE_ROUTED_TASK.key } })).toMatchObject({ definitionHash: task.definitionHash, policy: task.policy });

    const after = await run();
    expect(after).toMatchObject({ model: "fake-model-1-v2", modelConfig: { key: "fake-default-v2" } });
    expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: before.id }, include: { modelConfig: true } })).toMatchObject({
      model: FAKE_DEFAULT.model,
      modelConfig: { key: FAKE_DEFAULT.key, lifecycle: "DEPRECATED" },
    });
    const calls = await t.prisma.aiModelCall.findMany({ where: { executionId: before.id } });
    expect(calls.map((call) => call.model)).toEqual([FAKE_DEFAULT.model]);
  });
});
