import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { productionAiDefinitions } from "../../src/modules/ai/definitions";
import { MODEL_CATALOG } from "../../src/modules/ai/definitions/model-catalog";
import { AI_DEFINITIONS, type AiDefinitions, type CatalogModel, type TaskDefinition } from "../../src/modules/ai/definitions/types";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import type { AppConfig } from "../../src/platform/config/config.schema";
import { FakeModelProvider } from "../fixtures/ai/fake-model-provider";
import { drain, requestExecution } from "../helpers/ai";
import {
  getCurriculumAiStatus,
  PASSING_CURRICULUM_METRICS,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
} from "../helpers/curriculum-ai";
import { API_ROOT } from "../helpers/env";
import { createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { captureLogs } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

// 009: the model of a task comes from the catalog, never from a variable (research H2).
const MODEL_A = "anthropic/claude-haiku-4.5";
const MODEL_B = "anthropic/claude-haiku-4.6";
const FAKE_KEY = "sk-or-teste-008-US2-CHAVE-FALSA";
const ENTRY_KEY = "anthropic-basic";

/**
 * One capture for every app of the file: nestjs-pino sends the logs written outside a request
 * (the startup sync) to the first app created in the process.
 */
const logs = captureLogs();

/** The production catalog without any approval: no model may serve a task. */
const unapprovedCatalog = (): CatalogModel[] => MODEL_CATALOG.map((entry) => ({ ...entry, approvals: [] }));

/**
 * The production catalog with only its BASIC Anthropic entry, on `model`, promoted and approved for
 * the analysis: the release gate's own approvals are removed, so this entry is the policy's choice.
 */
function approvedCatalog(model = MODEL_A): CatalogModel[] {
  return unapprovedCatalog().map((entry) =>
    entry.key === ENTRY_KEY
      ? {
          ...entry,
          model,
          lifecycle: "PRODUCTION" as const,
          approvals: [{ taskKey: "curriculum-extraction", metrics: PASSING_CURRICULUM_METRICS, evaluatedAt: "2026-09-27T00:00:00.000Z", evidence: "test" }],
        }
      : entry,
  );
}

/**
 * The production definitions with `catalog`, the agent ACTIVE and a simulated provider under the
 * key `openrouter` (006/SC-011): what a deploy with that catalog syncs, without leaving the machine.
 */
function deployWith(
  provider: FakeModelProvider | null,
  catalog: CatalogModel[],
  tasks?: (tasks: TaskDefinition[]) => TaskDefinition[],
): { config: AppConfig; definitions: AiDefinitions } {
  const base = testConfig();
  const config: AppConfig = { ...base, ai: { ...base.ai, openrouter: { ...base.ai.openrouter, apiKey: FAKE_KEY } } };
  const production = productionAiDefinitions(config);
  return {
    config,
    definitions: {
      ...production,
      modelConfigs: catalog,
      tasks: tasks ? tasks(production.tasks) : production.tasks,
      agents: production.agents.map((agent) => ({ ...agent, initialStatus: "ACTIVE" as const })),
      providers: provider ? [provider] : [],
    },
  };
}

function appWith(provider: FakeModelProvider | null, catalog: CatalogModel[], tasks?: (tasks: TaskDefinition[]) => TaskDefinition[]): Promise<TestApp> {
  const { config, definitions } = deployWith(provider, catalog, tasks);
  return createTestApp({ config, logs, overrides: [{ provide: AI_DEFINITIONS, useValue: definitions }] });
}

const analysisUnavailable = () => logs.lines().filter((line) => line.msg === "ai.task_unavailable" && line.task === "curriculum-extraction");

describe("008/US2 o modelo de cada tarefa é trocado no catálogo, sem tocar no agente", () => {
  // Every log line of the file, not only the ones each test looks at, is free of the key.
  afterAll(() => expect(logs.text()).not.toContain(FAKE_KEY));

  it("008/US2-1 008/SC-002 trocar o modelo da entrada do catálogo e reiniciar: a nova execução usa B, a antiga continua com A, e a troca é auditada", async () => {
    const agentSource = readFileSync(join(API_ROOT, "src/modules/curriculum-ai/definitions/curriculum-agent.ts"), "utf8");
    const provider = new FakeModelProvider("openrouter");
    let teacher: TestUser;
    let documentId: string;
    let first: string;

    const a = await appWith(provider, approvedCatalog(MODEL_A));
    try {
      await resetDb(a.prisma);
      await a.get(AiRegistrySync).sync();
      teacher = await createUser(a, { roles: ["TEACHER"] });
      const cookie = await loginAs(a, teacher);
      documentId = (await seedProcessedDocument(a, teacher.id)).document.id;
      scriptCurriculumRun(provider, documentId, pooOutput());
      first = (await requestAnalysis(a, cookie, documentId)).body.execution.id as string;
      await drain(a);
    } finally {
      await a.close();
    }

    provider.reset();
    const b = await appWith(provider, approvedCatalog(MODEL_B));
    try {
      const event = await b.prisma.auditEvent.findFirstOrThrow({ where: { type: "ai_model_config.changed" } });
      const config = await b.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: ENTRY_KEY } });
      expect(event).toMatchObject({
        actorType: "SYSTEM",
        targetType: "AI_MODEL_CONFIG",
        targetId: config.id,
        metadata: { configKey: ENTRY_KEY, provider: "openrouter", previousModel: MODEL_A, model: MODEL_B },
      });
      expect(config.model).toBe(MODEL_B);

      const cookie = await loginAs(b, teacher!);
      // Discards the pending proposal of the first run, as a teacher asking again would.
      scriptCurriculumRun(provider, documentId!, pooOutput());
      const second = await requestAnalysis(b, cookie, documentId!, { discardPendingProposal: true });
      expect(second.status).toBe(202);
      await drain(b);

      const calls = async (executionId: string) =>
        (await b.prisma.aiModelCall.findMany({ where: { executionId }, orderBy: { sequence: "asc" } })).map((call) => call.model);
      expect(await calls(first!)).toEqual([MODEL_A, MODEL_A]);
      expect(await calls(second.body.execution.id)).toEqual([MODEL_B, MODEL_B]);
      expect(await b.prisma.aiExecution.findUniqueOrThrow({ where: { id: first! } })).toMatchObject({ model: MODEL_A });

      // A restart with the same model changes nothing.
      const again = await b.prisma.auditEvent.count({ where: { type: "ai_model_config.changed" } });
      await b.get(AiRegistrySync).sync();
      expect(await b.prisma.auditEvent.count({ where: { type: "ai_model_config.changed" } })).toBe(again);
    } finally {
      await b.close();
    }
    expect(readFileSync(join(API_ROOT, "src/modules/curriculum-ai/definitions/curriculum-agent.ts"), "utf8")).toBe(agentSource);
  });

  describe("008/US2-2 008/FR-008 009/FR-027 um catálogo ou uma política inválida deixa a tarefa indisponível sem derrubar a API", () => {
    const withModel = (model: string) => () => approvedCatalog(model);
    it.each([
      ["id fora do formato", withModel("claude haiku 4.5"), undefined, "MODEL_INVALID", "NO_APPROVED_MODEL"],
      ["modelo que escolhe outros modelos", withModel("openrouter/auto"), undefined, "MODEL_INVALID", "NO_APPROVED_MODEL"],
      ["família diferente do prefixo do id", withModel("openai/gpt-6-luna-x"), undefined, "FAMILY_MISMATCH", "NO_APPROVED_MODEL"],
      [
        "política com família fora da allowlist",
        () => approvedCatalog(),
        (tasks: TaskDefinition[]) => tasks.map((task) => (task.key === "curriculum-extraction" ? { ...task, allowedFamilies: ["google"] } : task)),
        null,
        "POLICY_INVALID",
      ],
    ] as const)("%s → a app inicia, MODEL_UNAVAILABLE, log com o motivo, e o fluxo manual funciona", async (_name, catalog, tasks, rejected, reason) => {
      const provider = new FakeModelProvider("openrouter");
      const t = await appWith(provider, catalog(), tasks);
      try {
        await resetDb(t.prisma);
        logs.clear();
        await t.get(AiRegistrySync).sync();
        expect((await api(t).get("/api/health/live")).status).toBe(200);

        if (rejected) {
          expect(logs.lines().find((line) => line.msg === "ai.catalog_entry_rejected")).toMatchObject({ configKey: ENTRY_KEY, reason: rejected });
        }
        expect(analysisUnavailable()).toEqual([expect.objectContaining({ task: "curriculum-extraction", reason })]);
        expect(logs.text()).not.toContain(FAKE_KEY);

        const teacher = await createUser(t, { roles: ["TEACHER"] });
        const cookie = await loginAs(t, teacher);
        const { document } = await seedProcessedDocument(t, teacher.id);
        expect((await getCurriculumAiStatus(t, cookie, document.id)).body.availability).toBe("MODEL_UNAVAILABLE");
        const res = await requestAnalysis(t, cookie, document.id);
        expect(res.status).toBe(503);
        expect(res.body.code).toBe("AI_MODEL_UNAVAILABLE");
        expect(provider.requests).toHaveLength(0);

        const client = api(t, { cookie });
        const draft = await client.post(`/api/syllabus-documents/${document.id}/revisions`, { source: "MANUAL" });
        expect(draft.status).toBe(201);
      } finally {
        await t.close();
      }
    });

    it("sem a chave, o log diz PROVIDER_NOT_REGISTERED", async () => {
      const t = await appWith(null, approvedCatalog());
      try {
        await resetDb(t.prisma);
        logs.clear();
        await t.get(AiRegistrySync).sync();
        expect(analysisUnavailable()).toEqual([expect.objectContaining({ reason: "PROVIDER_NOT_REGISTERED" })]);
      } finally {
        await t.close();
      }
    });

    it("009/FR-017 com o catálogo de produção sem aprovação, o log diz NO_APPROVED_MODEL", async () => {
      const t = await appWith(new FakeModelProvider("openrouter"), unapprovedCatalog());
      try {
        await resetDb(t.prisma);
        logs.clear();
        await t.get(AiRegistrySync).sync();
        expect(analysisUnavailable()).toEqual([expect.objectContaining({ reason: "NO_APPROVED_MODEL" })]);
      } finally {
        await t.close();
      }
    });

    it("com um modelo aprovado, nenhum ai.task_unavailable da análise", async () => {
      const t = await appWith(new FakeModelProvider("openrouter"), approvedCatalog());
      try {
        await resetDb(t.prisma);
        logs.clear();
        await t.get(AiRegistrySync).sync();
        expect(analysisUnavailable()).toEqual([]);
      } finally {
        await t.close();
      }
    });
  });

  describe("008/US2-3 o cliente não escolhe modelo, provedor nem tarefa", () => {
    let t: TestApp;
    let teacher: TestUser;
    let cookie: string;

    beforeAll(async () => {
      t = await appWith(new FakeModelProvider("openrouter"), approvedCatalog());
      await resetDb(t.prisma);
      await t.get(AiRegistrySync).sync();
      teacher = await createUser(t, { roles: ["TEACHER"] });
      cookie = await loginAs(t, teacher);
    });
    afterAll(() => t.close());

    it.each([{ model: MODEL_B }, { provider: "openrouter" }, { task: "curriculum-extraction" }])("POST ai-analyses com %o → 400 VALIDATION_ERROR", async (body) => {
      const { document } = await seedProcessedDocument(t, teacher.id);
      const res = await requestAnalysis(t, cookie, document.id, body as never);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(await t.prisma.aiExecution.count()).toBe(0);
    });

    it.each([{ model: MODEL_B }, { provider: "openrouter" }, { task: "curriculum-extraction" }])("POST /ai/executions com %o → 400 VALIDATION_ERROR", async (extra) => {
      const subjectId = (await createSubject(t, teacher.id)).id;
      const res = await requestExecution(t, cookie, { agentKey: "curriculum-agent", resource: { type: "SUBJECT", id: subjectId }, ...extra } as never);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    });
  });
});
