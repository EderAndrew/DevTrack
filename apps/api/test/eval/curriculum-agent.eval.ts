import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/platform/config/config.schema";
import { MODEL_CATALOG } from "../../src/modules/ai/definitions/model-catalog";
import { PRODUCTION_MODEL_FAMILIES } from "../../src/modules/ai/definitions/model-families";
import { AI_DEFINITIONS, type AiDefinitions, type CatalogModel, type ModelProvider, type ModelRequest, type ModelResponse } from "../../src/modules/ai/definitions/types";
import { AiEvaluationStore } from "../../src/modules/ai/evaluation/ai-evaluation.store";
import { OpenRouterProvider } from "../../src/modules/ai/gateway/providers/openrouter.provider";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { CURRICULUM_EXTRACTION_TASK, curriculumAiDefinitions } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { loadGoldenCases, seedEvaluationCases, toRecordedRun, writeRecordedRun } from "../fixtures/curriculum-agent/load-golden";
import { type CaseRun, printScores, runGoldenCase } from "../fixtures/curriculum-agent/run-case";
import { MIN_ITEM_RECALL } from "../fixtures/curriculum-agent/score";
import { TEST_CURRICULUM_AGENT } from "../helpers/curriculum-ai";
import { API_ROOT } from "../helpers/env";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/** Keeps the real provider's answers of the current case, for `EVAL_REPLAY=1`. */
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
/** `EVAL_RECORD=1` writes the evidence file of each model (009 contracts/catalog-and-quality-gate.md). */
const RECORD = process.env.EVAL_RECORD === "1";
/** `EVAL_REPLAY=1` also rewrites each `recorded.json` (the CI replay) with the first model's answers. */
const REPLAY = process.env.EVAL_REPLAY === "1";
/** `EVAL_MODEL=<catalog key>` evaluates only that entry. */
const ONLY = process.env.EVAL_MODEL?.trim() || null;

const OPENROUTER = loadConfig(process.env).ai.openrouter;

/**
 * The models the gate covers (009 research H12): the catalog's candidates for the analysis's tier,
 * or the one entry `EVAL_MODEL` names (any tier, e.g. a STANDARD one when no BASIC passes), each as
 * the only model of the route.
 */
const CANDIDATES = MODEL_CATALOG.filter((entry) =>
  ONLY
    ? entry.key === ONLY
    : entry.mode === CURRICULUM_EXTRACTION_TASK.mode &&
      entry.tier === CURRICULUM_EXTRACTION_TASK.preferredTier &&
      CURRICULUM_EXTRACTION_TASK.allowedFamilies.includes(entry.family),
);
if (ONLY && CANDIDATES.length === 0) throw new Error(`EVAL_MODEL=${ONLY} não é uma chave do catálogo`);
const MODELS = CANDIDATES.map((entry, index) => ({ role: entry.key, model: entry.model, entry, replay: REPLAY && index === 0 }));

/** Failures of the provider or of the account (402 no credit, 5xx, timeout): no verdict on the model. */
const INFRASTRUCTURE_ERRORS: ReadonlySet<string> = new Set(["AI_MODEL_UNAVAILABLE", "AI_PROVIDER_ERROR", "AI_RATE_LIMITED", "AI_TIMEOUT"]);

interface ScoredRun {
  name: string;
  injection: boolean;
  run: CaseRun;
}

/**
 * The metrics of the task's quality gate over the whole set (the 007 scorer's): recall of the
 * items in order, share of cases with a valid proposal, failures summed, and injection clean
 * only when every injection case is.
 */
function gateMetrics(runs: ScoredRun[]): Record<string, number> {
  const total = (metric: string) => runs.reduce((sum, { run }) => sum + (run.score.metrics[metric] ?? 0), 0);
  const expected = total("expectedItems");
  const injections = runs.filter(({ injection }) => injection);
  const round = (value: number) => Math.round(value * 10_000) / 10_000;
  return {
    itemRecall: round(expected === 0 ? 1 : total("itemsInOrder") / expected),
    schemaValidity: round(runs.filter(({ run }) => run.status === "COMPLETED" && run.score.metrics.schemaValid === 1).length / runs.length),
    unsupportedWithoutWarning: total("unsupportedWithoutWarning"),
    inventedFields: total("inventedFields"),
    // 010/SC-012: the share of cases whose proposed language is the expected one.
    languageMatch: round(runs.filter(({ run }) => run.score.metrics.languageMatch === 1).length / runs.length),
    injectionClean: injections.every(({ run }) => run.score.metrics.injectionClean === 1) ? 1 : 0,
  };
}

/**
 * The evidence file of one model (`test/fixtures/evaluations/<task>/<model key>.json`): the model
 * OpenRouter served and the cost it reported, read from `ai_model_calls` of this run.
 */
async function writeEvidence(t: TestApp, entry: CatalogModel, runs: ScoredRun[], evaluatedAt: string): Promise<string> {
  const calls = await t.prisma.aiModelCall.findMany({ select: { servedModel: true, estimatedCost: true, currency: true } });
  const served = new Map<string, number>();
  for (const call of calls) if (call.servedModel) served.set(call.servedModel, (served.get(call.servedModel) ?? 0) + 1);
  const servedModel = [...served.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const micros = calls.reduce((sum, call) => sum + (call.estimatedCost ? BigInt(call.estimatedCost.mul(1_000_000).toFixed(0)) : 0n), 0n);
  const executions = await t.prisma.aiExecution.count();
  const usd = (value: bigint) => (Number(value) / 1_000_000).toFixed(6);
  const evidence = {
    task: CURRICULUM_EXTRACTION_TASK.key,
    model: entry.model,
    servedModel,
    goldenSetVersion: Math.max(...CASES.map((golden) => golden.expected.version)),
    evaluatedAt,
    metrics: gateMetrics(runs),
    cost: { total: usd(micros), currency: calls.find((call) => call.currency)?.currency ?? "USD", perExecution: usd(executions === 0 ? 0n : micros / BigInt(executions)) },
  };
  const path = join(API_ROOT, "test/fixtures/evaluations", CURRICULUM_EXTRACTION_TASK.key, `${entry.key}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  return path;
}

/**
 * On-demand release gate of the Curriculum Agent (007/FR-051, research C17, quickstart §3): the
 * golden set and the scorer of the CI run, against OpenRouter and the catalog entries of the
 * `curriculum-extraction` tier and families (009 research H12; 008/SC-009, research G20).
 * Run `OPENROUTER_API_KEY=… pnpm --filter api eval:curriculum` (`EVAL_MODEL=<catalog key>` for one
 * entry); `EVAL_RECORD=1` writes each model's evidence file and `EVAL_REPLAY=1` rewrites each
 * `recorded.json` for review. A model is approved for the task only with committed
 * evidence that meets the SC-005 and SC-006 thresholds (009 contracts/catalog-and-quality-gate.md).
 */
describe.each(MODELS)("007/FR-051 008/US1-4 008/SC-009 009/FR-017 avaliação sob demanda do curriculum-agent: modelo $role ($model)", ({ entry, replay }) => {
  let t: TestApp;
  let provider: RecordingProvider;
  let caseIds: Map<string, string>;
  const runs: ScoredRun[] = [];
  const evaluatedAt = new Date().toISOString();

  beforeAll(async () => {
    const openrouter = OPENROUTER;
    if (!openrouter.apiKey) {
      throw new Error("eval:curriculum precisa de OPENROUTER_API_KEY: OPENROUTER_API_KEY=… pnpm --filter api eval:curriculum");
    }
    provider = new RecordingProvider(new OpenRouterProvider({ apiKey: openrouter.apiKey, baseUrl: openrouter.baseUrl }));
    const curriculum = curriculumAiDefinitions();
    const definitions: AiDefinitions = {
      agents: [TEST_CURRICULUM_AGENT],
      tools: curriculum.tools,
      // The model under evaluation as the only model the policy can choose: promoted and approved here only.
      modelConfigs: [
        {
          ...entry,
          lifecycle: "PRODUCTION",
          approvals: [{ taskKey: CURRICULUM_EXTRACTION_TASK.key, metrics: { ...CURRICULUM_EXTRACTION_TASK.quality }, evaluatedAt: new Date().toISOString(), evidence: "eval" }],
        },
      ],
      // An entry of another tier (`EVAL_MODEL`, e.g. a STANDARD one when no BASIC passes) is evaluated
      // with the task moved to its tier here only; the production task keeps its own tiers.
      tasks: curriculum.tasks.map((task) =>
        task.key === CURRICULUM_EXTRACTION_TASK.key ? { ...task, minimumTier: entry.tier, preferredTier: entry.tier, maxTier: entry.tier } : task,
      ),
      families: PRODUCTION_MODEL_FAMILIES,
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
    // Written whether the model passes or not: a failed evaluation is the record that justifies another tier.
    const infrastructure = runs.filter(({ run }) => run.errorCode !== null && INFRASTRUCTURE_ERRORS.has(run.errorCode));
    if (RECORD && infrastructure.length > 0) {
      console.warn(`evidência NÃO gravada: ${infrastructure.length} caso(s) falharam no provedor (${[...new Set(infrastructure.map(({ run }) => run.errorCode))].join(", ")})`);
    } else if (RECORD && t && runs.length === CASES.length) {
      const path = await writeEvidence(t, entry, runs, evaluatedAt);
      console.info(`evidência: ${path}`, gateMetrics(runs));
    }
    await t?.close();
  });

  it.each(CASES.map((golden) => [golden.name, golden] as const))("%s", async (name, golden) => {
    provider.responses.length = 0;
    const run = await runGoldenCase(t, golden, caseIds.get(name)!);
    runs.push({ name, injection: golden.expected.injection, run });
    if (replay) writeRecordedRun(name, toRecordedRun(provider.responses, run.documentId));

    expect(run.status, `${name}: ${run.errorCode}`).toBe("COMPLETED");
    expect(run.score.passed, JSON.stringify(run.score.metrics)).toBe(true);
  });

  it("007/SC-005 e 007/SC-006 no conjunto inteiro", () => {
    const total = (metric: string) => runs.reduce((sum, { run }) => sum + run.score.metrics[metric]!, 0);
    expect(total("unsupportedWithoutWarning")).toBe(0);
    expect(total("inventedFields")).toBe(0);
    expect(total("itemsInOrder") / total("expectedItems")).toBeGreaterThanOrEqual(MIN_ITEM_RECALL);
    expect(runs.filter(({ injection }) => injection).every(({ run }) => run.score.metrics.injectionClean === 1)).toBe(true);
    expect(runs.every(({ run }) => run.score.metrics.languageMatch === 1)).toBe(true);
  });
});
