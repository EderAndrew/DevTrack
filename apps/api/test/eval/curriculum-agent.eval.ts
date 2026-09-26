import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/platform/config/config.schema";
import { openRouterModelConfigs } from "../../src/modules/ai/definitions";
import { AI_DEFINITIONS, type AiDefinitions, type ModelProvider, type ModelRequest, type ModelResponse } from "../../src/modules/ai/definitions/types";
import { AiEvaluationStore } from "../../src/modules/ai/evaluation/ai-evaluation.store";
import { OpenRouterProvider } from "../../src/modules/ai/gateway/providers/openrouter.provider";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { curriculumAiDefinitions } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { loadGoldenCases, seedEvaluationCases, toRecordedRun, writeRecordedRun } from "../fixtures/curriculum-agent/load-golden";
import { type CaseRun, printScores, runGoldenCase } from "../fixtures/curriculum-agent/run-case";
import { MIN_ITEM_RECALL } from "../fixtures/curriculum-agent/score";
import { TEST_CURRICULUM_AGENT } from "../helpers/curriculum-ai";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** Keeps the real provider's answers of the current case, for `EVAL_RECORD=1`. */
class RecordingProvider implements ModelProvider {
  readonly responses: ModelResponse[] = [];

  constructor(private readonly inner: ModelProvider) {}

  get key(): string {
    return this.inner.key;
  }

  async generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> {
    return this.keep(await this.inner.generate(request, signal));
  }

  async generateStructured(request: ModelRequest, jsonSchema: object, signal: AbortSignal): Promise<ModelResponse> {
    return this.keep(await this.inner.generateStructured(request, jsonSchema, signal));
  }

  healthCheck(signal: AbortSignal) {
    return this.inner.healthCheck(signal);
  }

  private keep(response: ModelResponse): ModelResponse {
    this.responses.push(response);
    return response;
  }
}

const CASES = loadGoldenCases();
const RECORD = process.env.EVAL_RECORD === "1";

/**
 * On-demand release gate of the Curriculum Agent (007/FR-051, research C17, quickstart §3): the
 * golden set and the scorer of the CI run, against OpenRouter and the production model config of
 * `OPENROUTER_DEFAULT_MODEL` (008/FR-022, research G20). Run
 * `OPENROUTER_API_KEY=… pnpm --filter api eval:curriculum`; with `EVAL_RECORD=1` it also rewrites
 * each `recorded.json` for review. The agent is enabled in "Operação de IA" with that model only
 * after this passes the SC-005 and SC-006 thresholds.
 */
describe("007/FR-051 008/US1-4 avaliação sob demanda do curriculum-agent com o provedor real", () => {
  let t: TestApp;
  let provider: RecordingProvider;
  let caseIds: Map<string, string>;
  const runs: { name: string; injection: boolean; run: CaseRun }[] = [];

  beforeAll(async () => {
    const { openrouter } = loadConfig(process.env).ai;
    if (!openrouter.apiKey) {
      throw new Error("eval:curriculum precisa de OPENROUTER_API_KEY: OPENROUTER_API_KEY=… pnpm --filter api eval:curriculum");
    }
    provider = new RecordingProvider(new OpenRouterProvider({ apiKey: openrouter.apiKey, baseUrl: openrouter.baseUrl }));
    const curriculum = curriculumAiDefinitions();
    const definitions: AiDefinitions = {
      agents: [TEST_CURRICULUM_AGENT],
      tools: curriculum.tools,
      // The primary model only; the fallback run joins in 008/T036.
      modelConfigs: openRouterModelConfigs({ ...openrouter, fallbackModel: null }),
      tasks: curriculum.tasks,
      providers: [provider],
      resources: curriculum.resources,
    };
    t = await createTestApp({ overrides: [{ provide: AI_DEFINITIONS, useValue: definitions }] });
    await resetDb(t.prisma);
    await t.get(AiRegistrySync).sync();
    caseIds = await seedEvaluationCases(t.get(AiEvaluationStore), CASES);
  });
  afterAll(async () => {
    printScores(runs);
    await t?.close();
  });

  it.each(CASES.map((golden) => [golden.name, golden] as const))("%s", async (name, golden) => {
    provider.responses.length = 0;
    const run = await runGoldenCase(t, golden, caseIds.get(name)!);
    runs.push({ name, injection: golden.expected.injection, run });
    if (RECORD) writeRecordedRun(name, toRecordedRun(provider.responses, run.documentId));

    expect(run.status, `${name}: ${run.errorCode}`).toBe("COMPLETED");
    expect(run.score.passed, JSON.stringify(run.score.metrics)).toBe(true);
  });

  it("007/SC-005 e 007/SC-006 no conjunto inteiro", () => {
    const total = (metric: string) => runs.reduce((sum, { run }) => sum + run.score.metrics[metric]!, 0);
    expect(total("unsupportedWithoutWarning")).toBe(0);
    expect(total("inventedFields")).toBe(0);
    expect(total("itemsInOrder") / total("expectedItems")).toBeGreaterThanOrEqual(MIN_ITEM_RECALL);
    expect(runs.filter(({ injection }) => injection).every(({ run }) => run.score.metrics.injectionClean === 1)).toBe(true);
  });
});
