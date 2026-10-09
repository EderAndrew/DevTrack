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
import { WORK_HELP_TASK } from "../../src/modules/work-help/definitions/work-helper";
import { workHelpDefinitions } from "../../src/modules/work-help/work-help.definitions";
import { loadWorkHelpCases, seedWorkHelpCases, toRecordedRun, writeRecordedRun } from "../fixtures/work-help/load-golden";
import { p95, printWorkHelpScores, runWorkHelpCase, type WorkHelpRun } from "../fixtures/work-help/run-case";
import { workHelpGateMetrics } from "../fixtures/work-help/score";
import { API_ROOT } from "../helpers/env";
import { createTestApp, resetDb, testConfig, type TestApp } from "../helpers/test-app";
import { testWorkHelpAgents } from "../helpers/work-help";

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

const CASES = loadWorkHelpCases();
/** `EVAL_RECORD=1` writes the evidence file of each model (009 contracts/catalog-and-quality-gate.md). */
const RECORD = process.env.EVAL_RECORD === "1";
/** `EVAL_REPLAY=1` also rewrites each `recorded.json` (the CI replay) with the first model's answers. */
const REPLAY = process.env.EVAL_REPLAY === "1";
/** `EVAL_MODEL=<catalog key>` evaluates only that entry. */
const ONLY = process.env.EVAL_MODEL?.trim() || null;

const OPENROUTER = loadConfig(process.env).ai.openrouter;

/** 015/SC-007: the student receives an orientation within 15 seconds in 95% of the requests. */
const SC007_P95_MS = 15_000;

/**
 * The models the gate covers (009 research H12): the catalog's candidates for the task's preferred
 * tier and families, or the one entry `EVAL_MODEL` names (any tier), each as the only model of the route.
 */
const CANDIDATES = MODEL_CATALOG.filter((entry) =>
  ONLY ? entry.key === ONLY : entry.mode === WORK_HELP_TASK.mode && entry.tier === WORK_HELP_TASK.preferredTier && WORK_HELP_TASK.allowedFamilies.includes(entry.family),
);
if (ONLY && CANDIDATES.length === 0) throw new Error(`EVAL_MODEL=${ONLY} não é uma chave do catálogo`);
const MODELS = CANDIDATES.map((entry, index) => ({ role: entry.key, model: entry.model, entry, replay: REPLAY && index === 0 }));

/** Failures of the provider or of the account (402 no credit, 5xx, timeout): no verdict on the model. */
const INFRASTRUCTURE_ERRORS: ReadonlySet<string> = new Set(["AI_MODEL_UNAVAILABLE", "AI_PROVIDER_ERROR", "AI_RATE_LIMITED", "AI_TIMEOUT"]);

interface ScoredRun {
  name: string;
  injection: boolean;
  run: WorkHelpRun;
}

const gateMetrics = (runs: ScoredRun[]) => workHelpGateMetrics(runs.map(({ injection, run }) => ({ injection, metrics: run.score.metrics })));

/** 015/SC-007 over the set: each case's time from the request to the settled request, and the 95th percentile. */
function latency(runs: ScoredRun[]) {
  return {
    perCaseMs: Object.fromEntries(runs.map(({ name, run }) => [name, run.latencyMs])),
    p95Ms: p95(runs.map(({ run }) => run.latencyMs)),
  };
}

/** Every answer of the model, whole, for the person who approves it to read (015/SC-003: pertinence). */
const answers = (runs: ScoredRun[]) => runs.map(({ name, run }) => ({ case: name, status: run.helpStatus, output: run.output }));

/**
 * The evidence file of one model (`test/fixtures/evaluations/work-help/<model key>.json`): the model
 * OpenRouter served and the cost it reported, read from `ai_model_calls` of this run, plus the
 * latency of each case (015/SC-007) and every answer for human reading (015/SC-003).
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
    task: WORK_HELP_TASK.key,
    model: entry.model,
    servedModel,
    goldenSetVersion: Math.max(...CASES.map((golden) => golden.expected.version)),
    evaluatedAt,
    metrics: gateMetrics(runs),
    cost: { total: usd(micros), currency: calls.find((call) => call.currency)?.currency ?? "USD", perExecution: usd(executions === 0 ? 0n : micros / BigInt(executions)) },
    latency: latency(runs),
    answers: answers(runs),
  };
  const path = join(API_ROOT, "test/fixtures/evaluations", WORK_HELP_TASK.key, `${entry.key}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(evidence, null, 2)}\n`);
  return path;
}

/**
 * On-demand release gate of the AI help (015 research F16, quickstart): the golden set and the
 * scorer of the CI run, against OpenRouter and the catalog entries of the `work-help` tier and
 * families. Run `OPENROUTER_API_KEY=… pnpm --filter api eval:help` (`EVAL_MODEL=<catalog key>` for
 * one entry); `EVAL_RECORD=1` writes each model's evidence file, with the latency of each case and
 * every answer, and `EVAL_REPLAY=1` rewrites each `recorded.json` for review. A model is approved
 * for the task only with committed evidence that meets the task's thresholds (009
 * contracts/catalog-and-quality-gate.md); the `work-helper` stays DISABLED until then.
 */
describe.each(MODELS)("015/SC-002 015/SC-003 015/SC-007 avaliação sob demanda do work-helper: modelo $role ($model)", ({ entry, replay }) => {
  let t: TestApp;
  let provider: RecordingProvider;
  let caseIds: Map<string, string>;
  const runs: ScoredRun[] = [];
  const evaluatedAt = new Date().toISOString();

  beforeAll(async () => {
    const openrouter = OPENROUTER;
    if (!openrouter.apiKey) {
      throw new Error("eval:help precisa de OPENROUTER_API_KEY: OPENROUTER_API_KEY=… pnpm --filter api eval:help");
    }
    provider = new RecordingProvider(new OpenRouterProvider({ apiKey: openrouter.apiKey, baseUrl: openrouter.baseUrl }));
    const help = workHelpDefinitions();
    const definitions: AiDefinitions = {
      agents: testWorkHelpAgents(),
      tools: help.tools,
      // The model under evaluation as the only model the policy can choose: promoted and approved here only.
      modelConfigs: [
        {
          ...entry,
          lifecycle: "PRODUCTION",
          approvals: [{ taskKey: WORK_HELP_TASK.key, metrics: { ...WORK_HELP_TASK.quality }, evaluatedAt: new Date().toISOString(), evidence: "eval" }],
        },
      ],
      // An entry of another tier (`EVAL_MODEL`, research F8: STANDARD only if BASIC fails) is evaluated
      // with the task moved to its tier here only; the production task keeps its own tiers.
      tasks: help.tasks.map((task) =>
        task.key === WORK_HELP_TASK.key ? { ...task, minimumTier: entry.tier, preferredTier: entry.tier, maxTier: entry.tier } : task,
      ),
      families: PRODUCTION_MODEL_FAMILIES,
      providers: [provider],
      resources: help.resources,
    };
    // One student per case: the per-student limit of 015 never stops the set.
    t = await createTestApp({
      overrides: [{ provide: AI_DEFINITIONS, useValue: definitions }],
      config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, workHelpPerHour: 100 } },
    });
    await resetDb(t.prisma);
    await t.get(AiRegistrySync).sync();
    caseIds = await seedWorkHelpCases(t.get(AiEvaluationStore), CASES);
  });
  afterAll(async () => {
    printWorkHelpScores(runs);
    // Written whether the model passes or not: a failed evaluation is the record that justifies another tier.
    const infrastructure = runs.filter(({ run }) => run.errorCode !== null && INFRASTRUCTURE_ERRORS.has(run.errorCode));
    if (RECORD && infrastructure.length > 0) {
      console.warn(`evidência NÃO gravada: ${infrastructure.length} caso(s) falharam no provedor (${[...new Set(infrastructure.map(({ run }) => run.errorCode))].join(", ")})`);
    } else if (RECORD && t && runs.length === CASES.length) {
      const path = await writeEvidence(t, entry, runs, evaluatedAt);
      console.info(`evidência: ${path}`, gateMetrics(runs), latency(runs));
    }
    await t?.close();
  });

  it.each(CASES.map((golden) => [golden.name, golden] as const))("%s", async (name, golden) => {
    provider.responses.length = 0;
    const run = await runWorkHelpCase(t, golden, caseIds.get(name)!);
    runs.push({ name, injection: golden.expected.injection, run });
    if (replay) writeRecordedRun(name, toRecordedRun(provider.responses, run.requestId));

    expect(run.status, `${name}: ${run.errorCode}`).toBe("COMPLETED");
    expect(run.score.passed, JSON.stringify(run.score.metrics)).toBe(true);
  });

  it("015/SC-002 015/SC-003 limiares da tarefa no conjunto inteiro", () => {
    const metrics = gateMetrics(runs);
    const quality = WORK_HELP_TASK.quality;
    expect(metrics.schemaValidity).toBeGreaterThanOrEqual(quality.schemaValidity!);
    expect(metrics.leakFree).toBeGreaterThanOrEqual(quality.leakFree!);
    expect(metrics.injectionClean).toBeGreaterThanOrEqual(quality.injectionClean!);
    expect(metrics.scopeAccuracy).toBeGreaterThanOrEqual(quality.scopeAccuracy!);
    expect(metrics.relevance).toBeGreaterThanOrEqual(quality.relevance!);
  });

  it("015/SC-007 a orientação chega em até 15 segundos em 95% dos pedidos", () => {
    expect(latency(runs).p95Ms).toBeLessThanOrEqual(SC007_P95_MS);
  });
});
