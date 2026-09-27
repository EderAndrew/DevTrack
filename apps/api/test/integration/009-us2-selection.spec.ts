import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { type AiDefinitions, type CatalogModel } from "../../src/modules/ai/definitions/types";
import { AiPolicyRegistry } from "../../src/modules/ai/registry/ai-policy.registry";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CURRICULUM_EXTRACTION_TASK, curriculumAiDefinitions } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { referenceAiDefinitions } from "../fixtures/ai/definitions";
import { type AiTestApp, createAiTestApp, drain, resetAiDb } from "../helpers/ai";
import {
  CURRICULUM_TEST_MODEL,
  curriculumTestModel,
  getCurriculumAiStatus,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
  TEST_CURRICULUM_AGENT,
  TEST_CURRICULUM_FALLBACK_CONFIG,
  TEST_CURRICULUM_MODEL_CONFIG,
} from "../helpers/curriculum-ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { captureLogs } from "../helpers/log-capture";
import { api } from "../helpers/test-app";

const logs = captureLogs();

/** Cheaper than the BASIC entries, but STANDARD: a BASIC task never gets it (009/US2-1). */
const STANDARD_CHEAP = curriculumTestModel({
  key: "anthropic-standard",
  family: "anthropic",
  model: "anthropic/modelo-standard-teste",
  tier: "STANDARD",
  price: { inputPerMTok: "0.01", outputPerMTok: "0.01", currency: "USD" },
});

/** The cheapest BASIC entry, with no approval for the task (009/US2-3). */
const BASIC_UNAPPROVED = curriculumTestModel({
  key: "anthropic-basic-unapproved",
  family: "anthropic",
  model: "anthropic/modelo-sem-aprovacao",
  price: { inputPerMTok: "0.02", outputPerMTok: "0.02", currency: "USD" },
  approvals: [],
});

/** Approved BASIC, pricier than the primary and of its family: neither primary nor fallback. */
const BASIC_PRICEY = curriculumTestModel({
  key: "anthropic-basic-pricey",
  family: "anthropic",
  model: "anthropic/modelo-caro-teste",
  price: { inputPerMTok: "50", outputPerMTok: "250", currency: "USD" },
  priority: 9,
});

const CATALOG: CatalogModel[] = [TEST_CURRICULUM_MODEL_CONFIG, TEST_CURRICULUM_FALLBACK_CONFIG, STANDARD_CHEAP, BASIC_UNAPPROVED, BASIC_PRICEY];

/** The 004 manual flow: "Preencher manualmente", edit and confirm (004 FR-022). */
async function fillManually(t: AiTestApp, cookie: string, documentId: string) {
  const client = api(t, { cookie });
  const draft = await client.post(`/api/syllabus-documents/${documentId}/revisions`, { source: "MANUAL" });
  expect(draft.status).toBe(201);
  const saved = await client.put(`/api/syllabus-revisions/${draft.body.id}`, {
    title: "Programação Orientada a Objetos",
    syllabusText: "Ementa escrita à mão pelo professor.",
    competencyText: null,
    groups: [{ title: "Unidade 1", items: [{ text: "Classes e objetos" }] }],
  });
  expect(saved.status).toBe(200);
  const confirmed = await client.post(`/api/syllabus-revisions/${draft.body.id}/confirm`, {});
  expect(confirmed.status).toBe(200);
  expect(confirmed.body).toMatchObject({ status: "CONFIRMED", source: "MANUAL" });
}

describe("009/US2 nível certo pelo menor custo, com a escolha registrada na execução", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let document: SyllabusDocument;

  const curriculum = curriculumAiDefinitions();
  /** The app's definitions with `catalog` in place of the test catalog: what a new deploy syncs. */
  const definitionsWith = (catalog: CatalogModel[]): AiDefinitions => {
    const base = referenceAiDefinitions(t.provider);
    return {
      ...base,
      agents: [...base.agents, TEST_CURRICULUM_AGENT],
      tools: [...base.tools, ...curriculum.tools],
      modelConfigs: [...base.modelConfigs, ...catalog],
      tasks: [...base.tasks, ...curriculum.tasks],
      resources: { ...base.resources, ...curriculum.resources },
    };
  };
  const taskId = async () => (await t.prisma.aiTask.findUniqueOrThrow({ where: { key: CURRICULUM_EXTRACTION_TASK.key } })).id;

  beforeAll(async () => {
    t = await createAiTestApp({
      logs,
      agents: [TEST_CURRICULUM_AGENT],
      tools: curriculum.tools,
      modelConfigs: CATALOG,
      tasks: curriculum.tasks,
      resources: curriculum.resources,
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    logs.clear();
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    ({ document } = await seedProcessedDocument(t, teacher.id));
  });

  it("009/US2-6 009/FR-010 009/SC-002 a execução grava tarefa, nível, família, modelo e motivo, e mantém a escolha até o fim", async () => {
    const res = await requestAnalysis(t, cookie, document.id);
    expect(res.status).toBe(202);
    const id = res.body.execution.id as string;

    const requested = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id }, include: { modelConfig: true, fallbackModelConfig: true } });
    expect(requested).toMatchObject({
      taskKey: CURRICULUM_EXTRACTION_TASK.key,
      tier: "BASIC",
      selectionReason: "LOWEST_COST",
      model: CURRICULUM_TEST_MODEL,
      modelConfig: { key: TEST_CURRICULUM_MODEL_CONFIG.key, family: "anthropic", tier: "BASIC" },
      fallbackModelConfig: { key: TEST_CURRICULUM_FALLBACK_CONFIG.key, family: "openai", tier: "BASIC" },
    });
    const audit = await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_execution.requested", targetId: id } });
    expect(audit.metadata).toMatchObject({
      taskKey: CURRICULUM_EXTRACTION_TASK.key,
      tier: "BASIC",
      selectionReason: "LOWEST_COST",
      modelConfigKey: TEST_CURRICULUM_MODEL_CONFIG.key,
      fallbackModelConfigKey: TEST_CURRICULUM_FALLBACK_CONFIG.key,
    });

    // The same policy input gives the same route, request after request.
    const registry = t.get(AiPolicyRegistry);
    for (let i = 0; i < 5; i += 1) {
      expect(await registry.routeFor(await taskId())).toMatchObject({ primary: { key: TEST_CURRICULUM_MODEL_CONFIG.key }, reason: "LOWEST_COST" });
    }

    // A cheaper model approved after the request changes the next choice, never this execution's.
    const cheaper = await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: BASIC_UNAPPROVED.key } });
    await t.prisma.aiModelTaskApproval.create({
      data: { modelConfigId: cheaper.id, taskId: await taskId(), metrics: { ...CURRICULUM_EXTRACTION_TASK.quality }, evaluatedAt: new Date(), evidence: "teste", valid: true, syncedAt: new Date() },
    });
    expect(await registry.routeFor(await taskId())).toMatchObject({ primary: { key: BASIC_UNAPPROVED.key } });

    scriptCurriculumRun(t.provider, document.id, pooOutput());
    await drain(t);
    const finished = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id }, include: { modelConfig: true } });
    expect(finished).toMatchObject({ status: "COMPLETED", tier: "BASIC", selectionReason: "LOWEST_COST", modelConfig: { key: TEST_CURRICULUM_MODEL_CONFIG.key } });
    expect(new Set(t.provider.requests.map((request) => request.model))).toEqual(new Set([CURRICULUM_TEST_MODEL]));
  });

  it("009/US2-1 009/US2-3 nem o STANDARD mais barato nem o BASIC sem aprovação são chamados", async () => {
    const res = await requestAnalysis(t, cookie, document.id);
    expect(res.status).toBe(202);
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    await drain(t);

    const called = t.provider.requests.map((request) => request.model);
    expect(called).not.toContain(STANDARD_CHEAP.model);
    expect(called).not.toContain(BASIC_UNAPPROVED.model);
    expect(called).not.toContain(BASIC_PRICEY.model);
  });

  describe("009/US2-5 009/SC-010 sem modelo aprovado a tarefa fica indisponível e o fluxo manual segue", () => {
    it("aprovações inválidas: MODEL_UNAVAILABLE, 503 sem execução nem chamada, e a 004 manual funciona", async () => {
      await t.prisma.aiModelTaskApproval.updateMany({ where: { taskId: await taskId() }, data: { valid: false } });
      expect(await t.get(AiPolicyRegistry).availability(await taskId())).toBe("NO_APPROVED_MODEL");

      expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("MODEL_UNAVAILABLE");
      const request = await requestAnalysis(t, cookie, document.id);
      expect(request.status).toBe(503);
      expect(request.body.code).toBe("AI_MODEL_UNAVAILABLE");
      expect(await t.prisma.aiExecution.count()).toBe(0);
      expect(t.provider.requests).toEqual([]);

      await fillManually(t, cookie, document.id);
    });

    it("um deploy cujo catálogo não tem aprovado para a tarefa sobe normalmente, e o log diz o motivo", async () => {
      const unapproved = CATALOG.map((entry) => ({ ...entry, approvals: [] }));
      await expect(new AiRegistrySync(definitionsWith(unapproved), t.config, t.prisma, t.get(AuditService)).sync()).resolves.toBeTruthy();

      expect(logs.lines().filter((line) => line.msg === "ai.task_unavailable")).toContainEqual(
        expect.objectContaining({ task: CURRICULUM_EXTRACTION_TASK.key, reason: "NO_APPROVED_MODEL" }),
      );
      // Only the task key and the reason code: never a model id.
      for (const entry of CATALOG) expect(logs.text()).not.toContain(entry.model);

      expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("MODEL_UNAVAILABLE");
      expect((await requestAnalysis(t, cookie, document.id)).status).toBe(503);
      await fillManually(t, cookie, document.id);
    });

    it("todos os modelos aprovados desabilitados pelo administrador: ALL_BLOCKED no registro, MODEL_UNAVAILABLE para o professor", async () => {
      await t.prisma.aiModelConfig.updateMany({ where: { key: { in: CATALOG.map((entry) => entry.key) } }, data: { status: "DISABLED" } });
      expect(await t.get(AiPolicyRegistry).availability(await taskId())).toBe("ALL_BLOCKED");
      expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("MODEL_UNAVAILABLE");
      await fillManually(t, cookie, document.id);
    });
  });
});
