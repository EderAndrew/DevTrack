import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { CURRICULUM_AGENT, CURRICULUM_EXTRACTION_TASK } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import {
  CURRICULUM_TEST_MODEL,
  createCurriculumAiApp,
  pooOutput,
  requestAnalysis,
  scriptCurriculumRun,
  seedProcessedDocument,
  TEST_CURRICULUM_AGENT,
  TEST_CURRICULUM_MODEL_CONFIG,
} from "../helpers/curriculum-ai";
import { API_ROOT } from "../helpers/env";
import { createUser, loginAs, type TestUser } from "../helpers/factories";

describe("009/US3 o Curriculum Agent roda no nível BASIC sem mudar nada para o professor", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let cookie: string;
  let document: SyllabusDocument;

  beforeAll(async () => {
    t = await createCurriculumAiApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    cookie = await loginAs(t, teacher);
    ({ document } = await seedProcessedDocument(t, teacher.id));
  });

  it("009/US3-1 009/SC-005 com um BASIC aprovado, a análise usa BASIC e o registro mostra tarefa, nível, família e modelo", async () => {
    expect(CURRICULUM_EXTRACTION_TASK).toMatchObject({ preferredTier: "BASIC", minimumTier: "BASIC" });

    const res = await requestAnalysis(t, cookie, document.id);
    expect(res.status).toBe(202);
    scriptCurriculumRun(t.provider, document.id, pooOutput());
    await drain(t);

    const execution = await t.prisma.aiExecution.findUniqueOrThrow({
      where: { id: res.body.execution.id },
      include: { modelConfig: true, proposal: true, modelCallRows: { include: { modelConfig: true } } },
    });
    expect(execution).toMatchObject({
      status: "COMPLETED",
      agentKey: CURRICULUM_AGENT.key,
      taskKey: CURRICULUM_EXTRACTION_TASK.key,
      tier: "BASIC",
      model: CURRICULUM_TEST_MODEL,
      modelConfig: { key: TEST_CURRICULUM_MODEL_CONFIG.key, family: "anthropic", tier: "BASIC", lifecycle: "PRODUCTION" },
    });
    // Same proposal as 007: an L2 proposal waiting for the teacher.
    expect(execution.proposal).toMatchObject({ status: "READY_FOR_REVIEW" });
    expect(execution.modelCallRows.length).toBeGreaterThan(0);
    for (const call of execution.modelCallRows) expect(call.modelConfig).toMatchObject({ tier: "BASIC", family: "anthropic" });
    expect(new Set(t.provider.requests.map((request) => request.model))).toEqual(new Set([CURRICULUM_TEST_MODEL]));
  });

  it("009/US3-2 as suítes da 007 rodam pela política: o app delas escolhe o BASIC aprovado, sem configuração fixa", async () => {
    const task = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: CURRICULUM_EXTRACTION_TASK.key } });
    const res = await requestAnalysis(t, cookie, document.id);
    expect(res.status).toBe(202);
    const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: res.body.execution.id } });
    expect(execution).toMatchObject({ taskKey: task.key, tier: "BASIC", selectionReason: "ONLY_CANDIDATE" });

    // The 007 suites never fix a model config nor read the production catalog: they go through `createCurriculumAiApp`.
    const suites = readdirSync(join(API_ROOT, "test/integration")).filter((name) => name.startsWith("007-"));
    expect(suites.length).toBeGreaterThan(0);
    for (const name of suites) {
      const source = readFileSync(join(API_ROOT, "test/integration", name), "utf8");
      expect(source, name).not.toMatch(/MODEL_CATALOG|openrouter-(default|fallback)|OPENROUTER_(DEFAULT|FALLBACK)_MODEL/);
    }
  });

  it("009/US3-3 009/FR-007 o agente só nomeia a tarefa: nem nível, nem família, nem modelo", () => {
    for (const agent of [CURRICULUM_AGENT, TEST_CURRICULUM_AGENT]) {
      expect(agent.taskKey).toBe(CURRICULUM_EXTRACTION_TASK.key);
      for (const field of ["model", "modelConfigKey", "tier", "preferredTier", "minimumTier", "family", "families", "allowedFamilies", "provider"]) {
        expect(agent, field).not.toHaveProperty(field);
      }
      expect(JSON.stringify(agent)).not.toMatch(/\b(BASIC|STANDARD|ADVANCED)\b|anthropic|openai|typesafe/);
    }
  });
});
