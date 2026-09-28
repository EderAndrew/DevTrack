import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CurriculumProposalContentSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SyllabusDocument } from "../../src/generated/prisma/client";
import { AI_DEFINITIONS, defineCatalogModel } from "../../src/modules/ai/definitions/types";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { FakeModelProvider, fakeOutput, fakeServedModel, fakeToolCall } from "../fixtures/ai/fake-model-provider";
import { drain, resetAiDb } from "../helpers/ai";
import {
  CURRICULUM_TEST_MODEL,
  curriculumTestDefinitions,
  pooOutput,
  requestAnalysis,
  seedProcessedDocument,
  TEST_CURRICULUM_AGENT,
  TEST_CURRICULUM_MODEL_CONFIG,
} from "../helpers/curriculum-ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { API_ROOT } from "../helpers/env";
import { createTestApp, type TestApp } from "../helpers/test-app";

/** What OpenRouter answers as the served model: the requested id with a dated suffix. */
const SERVED = `${CURRICULUM_TEST_MODEL}-20260901`;

// 008/SC-001: the whole 007 suite runs on the task-routed agent with its behavior assertions as
// they were (only the version, model and config key changed, T019); this suite adds the OpenRouter side.
describe("008/US1 008/SC-001 \"Preencher com IA\" continua igual, agora através do OpenRouter", () => {
  describe("008/US1-1 a análise pelo provedor openrouter", () => {
    // A simulated provider under the key `openrouter` (006/SC-011): the route, the records and the
    // proposal are the ones production writes, without leaving the machine.
    const provider = new FakeModelProvider("openrouter");
    let t: TestApp;
    let teacher: TestUser;
    let cookie: string;
    let document: SyllabusDocument;

    beforeAll(async () => {
      const definitions = curriculumTestDefinitions(provider);
      definitions.modelConfigs = definitions.modelConfigs.map((config) =>
        config.key === TEST_CURRICULUM_MODEL_CONFIG.key ? defineCatalogModel({ ...config, provider: "openrouter" }) : config,
      );
      t = await createTestApp({ overrides: [{ provide: AI_DEFINITIONS, useValue: definitions }] });
    });
    afterAll(() => t.close());

    beforeEach(async () => {
      await resetAiDb(Object.assign(t, { provider }));
      teacher = await createUser(t, { roles: ["TEACHER"] });
      cookie = await loginAs(t, teacher);
      ({ document } = await seedProcessedDocument(t, teacher.id));
    });

    it("a execução conclui com a mesma proposta da 007 e registra tarefa, provedor, modelo servido e versão das instruções", async () => {
      provider.script(
        fakeServedModel(SERVED, fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: document.id })),
        fakeServedModel(SERVED, fakeOutput(pooOutput())),
      );
      const { status, body } = await requestAnalysis(t, cookie, document.id);
      expect(status).toBe(202);
      await drain(t);

      const execution = await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: body.execution.id }, include: { proposal: true } });
      expect(execution).toMatchObject({
        status: "COMPLETED",
        taskKey: "curriculum-extraction",
        provider: "openrouter",
        model: CURRICULUM_TEST_MODEL,
        agentVersion: TEST_CURRICULUM_AGENT.version,
        promptVersion: TEST_CURRICULUM_AGENT.prompt.version,
        fallbackUsed: false,
      });
      expect(execution.proposal).toMatchObject({ status: "READY_FOR_REVIEW", proposalType: "CURRICULUM_EXTRACTION", targetResourceId: document.id });
      const content = CurriculumProposalContentSchema.parse(execution.proposal!.payload);
      const texts = (groups: { title: string | null; items: { text: string }[] }[]) => groups.map((group) => [group.title, group.items.map((item) => item.text)]);
      expect(texts(content.extraction.groups)).toEqual(texts(pooOutput().groups));
      expect(content.extraction).toMatchObject({ title: pooOutput().title, syllabusText: pooOutput().syllabusText, competencyText: pooOutput().competencyText });

      const calls = await t.prisma.aiModelCall.findMany({ where: { executionId: execution.id }, orderBy: { sequence: "asc" } });
      expect(calls).toHaveLength(2);
      for (const call of calls) expect(call).toMatchObject({ status: "SUCCEEDED", provider: "openrouter", model: CURRICULUM_TEST_MODEL, servedModel: SERVED, isFallback: false });
      expect(provider.requests.map((request) => request.model)).toEqual([CURRICULUM_TEST_MODEL, CURRICULUM_TEST_MODEL]);
    });
  });

  it("008/US1-3 o código do Curriculum Agent não cita provedor, modelo, endereço, credencial nem cliente HTTP", () => {
    const root = join(API_ROOT, "src/modules/curriculum-ai");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (name.endsWith(".ts") && !name.endsWith(".spec.ts")) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);

    const FORBIDDEN = [
      /openrouter/i,
      /anthropic/i,
      /\bclaude\b/i,
      /\bgpt-/i,
      /\bgemini\b/i,
      /\bmistral\b/i,
      /\b(openai|google|meta-llama|mistralai|deepseek|x-ai|qwen|cohere|amazon|microsoft)\/[a-z0-9]/i, // an OpenRouter `vendor/model` id
      /https?:\/\//,
      /\bAPI_KEY\b|apiKey|Bearer\s/,
      /\bfetch\s*\(|node:https?|\baxios\b|\bundici\b/,
    ];
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return FORBIDDEN.filter((pattern) => pattern.test(text)).map((pattern) => `${relative(API_ROOT, file)}: ${pattern}`);
    });
    expect(offenders).toEqual([]);
  });
});
