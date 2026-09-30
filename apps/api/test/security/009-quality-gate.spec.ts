import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { productionAiDefinitions } from "../../src/modules/ai/definitions";
import { MODEL_CATALOG } from "../../src/modules/ai/definitions/model-catalog";
import { approvalMeetsQuality } from "../../src/modules/ai/policy/task-policy";
import { CURRICULUM_EXTRACTION_TASK } from "../../src/modules/curriculum-ai/definitions/curriculum-agent";
import { EXERCISE_GENERATION_TASK } from "../../src/modules/exercise-ai/definitions/exercise-generator";
import { WORK_GENERATION_TASK } from "../../src/modules/work-ai/definitions/work-generator";
import { API_ROOT } from "../helpers/env";
import { testConfig } from "../helpers/test-app";

// 009/FR-017 (contracts/catalog-and-quality-gate.md, research H6, H12): a model serves a task in
// production only with an approval backed by a committed evidence file of a real run. The file
// records the model OpenRouter served and what the run cost; the approval copies its metrics.

const REPO_ROOT = resolve(API_ROOT, "../..");
const EVIDENCE_DIR = join(API_ROOT, "test/fixtures/evaluations");

interface Evidence {
  task: string;
  model: string;
  servedModel: string;
  goldenSetVersion: number;
  evaluatedAt: string;
  metrics: Record<string, number>;
  cost: { total: string; currency: string; perExecution: string };
}

const DECIMAL = /^\d+(\.\d+)?$/;

const tasks = new Map(productionAiDefinitions(testConfig()).tasks.map((task) => [task.key, task]));

/** Every committed evidence file, as `<task>/<model key>.json` relative to the repository. */
function evidenceFiles(): string[] {
  if (!existsSync(EVIDENCE_DIR)) return [];
  return readdirSync(EVIDENCE_DIR, { withFileTypes: true })
    .filter((dir) => dir.isDirectory())
    .flatMap((dir) => readdirSync(join(EVIDENCE_DIR, dir.name)).map((file) => relative(REPO_ROOT, join(EVIDENCE_DIR, dir.name, file))));
}

const readEvidence = (path: string) => JSON.parse(readFileSync(join(REPO_ROOT, path), "utf8")) as Evidence;

const approvals = MODEL_CATALOG.flatMap((entry) => (entry.approvals ?? []).map((approval) => ({ entry, approval })));

describe("009/FR-017 portão de qualidade: aprovação por modelo × tarefa, com evidência", () => {
  it("cada aprovação aponta para o arquivo de evidência da tarefa e do modelo, e ele existe", () => {
    for (const { entry, approval } of approvals) {
      expect(approval.evidence, `${entry.key}/${approval.taskKey}`).toBe(`apps/api/test/fixtures/evaluations/${approval.taskKey}/${entry.key}.json`);
      expect(existsSync(join(REPO_ROOT, approval.evidence)), approval.evidence).toBe(true);
    }
  });

  it("a aprovação bate com a evidência: mesma tarefa, mesmo modelo, mesmas métricas, mesma data", () => {
    for (const { entry, approval } of approvals) {
      const evidence = readEvidence(approval.evidence);
      expect(evidence, approval.evidence).toMatchObject({ task: approval.taskKey, model: entry.model, evaluatedAt: approval.evaluatedAt });
      expect(approval.metrics, approval.evidence).toEqual(evidence.metrics);
    }
  });

  it("a evidência de uma aprovação atinge todos os limiares da tarefa", () => {
    for (const { entry, approval } of approvals) {
      const task = tasks.get(approval.taskKey);
      expect(task, `${entry.key}: tarefa ${approval.taskKey}`).toBeDefined();
      expect(approvalMeetsQuality(readEvidence(approval.evidence), task!.quality), approval.evidence).toBe(true);
    }
  });

  it("toda evidência registra o modelo servido e o custo de uma execução real", () => {
    for (const path of evidenceFiles()) {
      const evidence = readEvidence(path);
      const [task, file] = path.split("/").slice(-2) as [string, string];
      const entry = MODEL_CATALOG.find((model) => model.key === file.replace(/\.json$/, ""));
      expect(entry, `${path}: chave fora do catálogo`).toBeDefined();
      expect(evidence.task, path).toBe(task);
      expect(evidence.model, path).toBe(entry!.model);
      // OpenRouter answers the id it served, often with a date suffix: the same model, never another one.
      expect(evidence.servedModel.startsWith(entry!.model), `${path}: servido ${evidence.servedModel}`).toBe(true);
      expect(evidence.goldenSetVersion, path).toBeGreaterThanOrEqual(1);
      expect(Number.isNaN(Date.parse(evidence.evaluatedAt)), path).toBe(false);
      expect(evidence.cost.total, path).toMatch(DECIMAL);
      expect(evidence.cost.perExecution, path).toMatch(DECIMAL);
      expect(Number(evidence.cost.total), `${path}: custo de uma execução real`).toBeGreaterThan(0);
      expect(evidence.cost.currency, path).toBe("USD");
    }
  });

  it("uma aprovação nunca vem de respostas sem procedência (o recorded.json da 007, da 010 e da 011)", () => {
    for (const { approval } of approvals) expect(approval.evidence).not.toMatch(/recorded\.json|curriculum-agent\/golden|exercise-generation\/golden|work-generation\/golden/);
  });

  it("nenhum modelo PRODUCTION sem aprovação para ao menos uma tarefa", () => {
    for (const entry of MODEL_CATALOG) {
      if (entry.lifecycle === "PRODUCTION") expect(entry.approvals ?? [], entry.key).not.toEqual([]);
    }
  });

  it("009/US3-1 a extração da ementa tem ao menos um modelo aprovado do seu nível no catálogo de produção", () => {
    const approved = MODEL_CATALOG.filter(
      (entry) =>
        entry.lifecycle === "PRODUCTION" &&
        entry.tier === CURRICULUM_EXTRACTION_TASK.preferredTier &&
        entry.mode === CURRICULUM_EXTRACTION_TASK.mode &&
        CURRICULUM_EXTRACTION_TASK.allowedFamilies.includes(entry.family) &&
        (entry.approvals ?? []).some((approval) => approval.taskKey === CURRICULUM_EXTRACTION_TASK.key),
    );
    expect(approved.map((entry) => entry.key)).not.toEqual([]);
  });

  it("010/FR-033 010/SC-010 a geração de exercícios tem ao menos um modelo aprovado do seu nível, com a evidência do conjunto da 010 e a latência de cada caso", () => {
    const approved = MODEL_CATALOG.filter(
      (entry) =>
        entry.lifecycle === "PRODUCTION" &&
        entry.tier === EXERCISE_GENERATION_TASK.preferredTier &&
        entry.mode === EXERCISE_GENERATION_TASK.mode &&
        EXERCISE_GENERATION_TASK.allowedFamilies.includes(entry.family) &&
        (entry.approvals ?? []).some((approval) => approval.taskKey === EXERCISE_GENERATION_TASK.key),
    );
    expect(approved.map((entry) => entry.key)).not.toEqual([]);
    for (const entry of approved) {
      const approval = entry.approvals!.find((candidate) => candidate.taskKey === EXERCISE_GENERATION_TASK.key)!;
      const evidence = readEvidence(approval.evidence) as Evidence & { latency?: { perCaseMs: Record<string, number>; withinTwoMinutes: number } };
      expect(Object.keys(evidence.metrics).sort(), approval.evidence).toEqual(Object.keys(EXERCISE_GENERATION_TASK.quality).sort());
      // 010/SC-002: measured by the on-demand run with the real model, one time per golden case.
      expect(Object.keys(evidence.latency?.perCaseMs ?? {}).length, approval.evidence).toBeGreaterThanOrEqual(5);
      expect(evidence.latency!.withinTwoMinutes, approval.evidence).toBeGreaterThanOrEqual(0.95);
    }
  });

  it("011/FR-030 011/SC-012 a geração de trabalhos tem ao menos um modelo aprovado do seu nível, com a latência de cada caso e as pegadinhas listadas para leitura humana", () => {
    const approved = MODEL_CATALOG.filter(
      (entry) =>
        entry.lifecycle === "PRODUCTION" &&
        entry.tier === WORK_GENERATION_TASK.preferredTier &&
        entry.mode === WORK_GENERATION_TASK.mode &&
        WORK_GENERATION_TASK.allowedFamilies.includes(entry.family) &&
        (entry.approvals ?? []).some((approval) => approval.taskKey === WORK_GENERATION_TASK.key),
    );
    expect(approved.map((entry) => entry.key)).not.toEqual([]);
    for (const entry of approved) {
      const approval = entry.approvals!.find((candidate) => candidate.taskKey === WORK_GENERATION_TASK.key)!;
      const evidence = readEvidence(approval.evidence) as Evidence & {
        latency?: { perCaseMs: Record<string, number>; withinTwoMinutes: number };
        trickQuestions?: { case: string; statement: string; alternatives: { text: string; isCorrect: boolean }[] }[];
      };
      expect(Object.keys(evidence.metrics).sort(), approval.evidence).toEqual(Object.keys(WORK_GENERATION_TASK.quality).sort());
      // 011/SC-002: measured by the on-demand run with the real model, one time per golden case.
      expect(Object.keys(evidence.latency?.perCaseMs ?? {}).length, approval.evidence).toBeGreaterThanOrEqual(5);
      expect(evidence.latency!.withinTwoMinutes, approval.evidence).toBeGreaterThanOrEqual(0.95);
      // 011/FR-030: the trick questions are in the evidence, whole, each with exactly one correct alternative.
      expect(evidence.trickQuestions?.length ?? 0, approval.evidence).toBeGreaterThan(0);
      for (const trick of evidence.trickQuestions!) {
        expect(trick.statement.length, approval.evidence).toBeGreaterThan(0);
        expect(trick.alternatives.filter((alternative) => alternative.isCorrect), `${approval.evidence}: ${trick.case}`).toHaveLength(1);
      }
    }
  });
});
