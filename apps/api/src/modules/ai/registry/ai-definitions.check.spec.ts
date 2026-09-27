import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "../definitions/model-catalog";
import { PRODUCTION_MODEL_FAMILIES } from "../definitions/model-families";
import { type CatalogModel, defineTask, type TaskDefinition } from "../definitions/types";
import { taskPolicyProblem, taskPolicyOf } from "../policy/task-policy";
import { checkCatalog } from "./ai-definitions.check";

const FAMILIES = [...PRODUCTION_MODEL_FAMILIES, "fake"];

const entry = (change: Partial<CatalogModel> = {}): CatalogModel => ({
  key: "anthropic-basic",
  provider: "openrouter",
  family: "anthropic",
  model: "anthropic/claude-haiku-4.5",
  tier: "BASIC",
  mode: "GENERATION",
  lifecycle: "CANDIDATE",
  initialStatus: "ENABLED",
  contextWindow: 200_000,
  capabilities: { structuredOutput: true, tools: true, vision: false, reasoning: false },
  maxOutputTokens: 1000,
  timeoutMs: 30_000,
  ...change,
});

const task = (change: Partial<TaskDefinition> = {}): TaskDefinition =>
  defineTask({
    key: "task",
    mode: "GENERATION",
    minimumTier: "BASIC",
    preferredTier: "BASIC",
    allowedFamilies: ["anthropic"],
    requiredCapabilities: ["structuredOutput"],
    fallback: "SAME_TIER",
    escalation: "NONE",
    quality: { schemaValidity: 1 },
    typicalUsage: { inputTokens: 100, outputTokens: 10 },
    maxOutputTokens: 1000,
    timeoutMs: 30_000,
    ...change,
  });

const problem = (change: Partial<TaskDefinition>) => taskPolicyProblem(taskPolicyOf(task(change)), FAMILIES);

describe("009/FR-001 allowlist de famílias de produção", () => {
  it("é exatamente openai, anthropic e typesafe", () => {
    expect([...PRODUCTION_MODEL_FAMILIES].sort()).toEqual(["anthropic", "openai", "typesafe"]);
  });

  it("o catálogo de produção passa inteiro pelas checagens, só com famílias da allowlist", () => {
    const result = checkCatalog({ modelConfigs: [...MODEL_CATALOG], families: PRODUCTION_MODEL_FAMILIES });
    expect(result.rejected).toEqual([]);
    expect(MODEL_CATALOG.every((model) => model.model.split("/")[0] === model.family)).toBe(true);
  });
});

describe("009/FR-027 checagem do catálogo: entrada inválida fica de fora sem derrubar a API", () => {
  it.each([
    ["família fora da allowlist", entry({ family: "mistral", model: "mistral/large" }), "FAMILY_NOT_ALLOWED"],
    ["prefixo do id diferente da família", entry({ model: "openai/gpt-6-luna" }), "FAMILY_MISMATCH"],
    ["id sem prefixo numa família de produção", entry({ model: "claude-haiku" }), "MODEL_INVALID"],
    ["id openrouter/* (roteamento automático)", entry({ family: "openai", model: "openrouter/auto" }), "MODEL_INVALID"],
    ["modelo de decisão com saída estruturada", entry({ mode: "DECISION" }), "DECISION_CAPABILITIES"],
    ["janela de contexto inválida", entry({ contextWindow: 0 }), "VALUE_INVALID"],
    ["chave inválida", entry({ key: "Anthropic Basic" }), "KEY_INVALID"],
  ])("%s", (_name, model, reason) => {
    expect(checkCatalog({ modelConfigs: [model], families: FAMILIES })).toEqual({ accepted: [], rejected: [{ key: model.key, reason }] });
  });

  it("id sem prefixo só para família fora da produção (a `fake` dos testes)", () => {
    expect(checkCatalog({ modelConfigs: [entry({ family: "fake", model: "fake-model-1" })], families: FAMILIES }).rejected).toEqual([]);
  });

  it("chave ou modelo repetidos: a primeira entrada vale", () => {
    const result = checkCatalog({
      modelConfigs: [entry(), entry({ model: "anthropic/other" }), entry({ key: "anthropic-copy" })],
      families: FAMILIES,
    });
    expect(result.accepted.map((model) => model.key)).toEqual(["anthropic-basic"]);
    expect(result.rejected.map((r) => r.reason)).toEqual(["KEY_DUPLICATED", "MODEL_DUPLICATED"]);
  });
});

describe("009/FR-006 checagem da política da tarefa", () => {
  it("uma política completa é válida", () => {
    expect(problem({})).toBeNull();
    expect(problem({ maxTier: "STANDARD", escalation: "ON_OUTPUT_INVALID" })).toBeNull();
  });

  it.each([
    ["mínimo acima do preferido", { minimumTier: "STANDARD" as const }],
    ["teto abaixo do preferido", { preferredTier: "STANDARD" as const, maxTier: "BASIC" as const }],
    ["família fora da allowlist", { allowedFamilies: ["mistral"] }],
    ["sem famílias", { allowedFamilies: [] }],
    ["capacidade desconhecida", { requiredCapabilities: ["telepathy" as never] }],
    ["métrica de qualidade desconhecida", { quality: { vibes: 1 } }],
    ["uso típico negativo", { typicalUsage: { inputTokens: -1, outputTokens: 0 } }],
    ["minConfidence numa tarefa de geração", { minConfidence: 0.9 }],
  ])("%s → inválida", (_name, change) => {
    expect(problem(change)).not.toBeNull();
  });

  const decision = { mode: "DECISION" as const, allowedFamilies: ["typesafe"], requiredCapabilities: [] };

  it.each([0.5, 0, 1.01, undefined])("decisão com minConfidence %s fora de (0.5, 1] → inválida", (minConfidence) => {
    expect(problem({ ...decision, minConfidence })).not.toBeNull();
  });

  it("decisão com minConfidence em (0.5, 1] é válida; escalonamento e saída estruturada não", () => {
    expect(problem({ ...decision, minConfidence: 0.51 })).toBeNull();
    expect(problem({ ...decision, minConfidence: 1 })).toBeNull();
    expect(problem({ ...decision, minConfidence: 0.8, requiredCapabilities: ["structuredOutput"] })).not.toBeNull();
    expect(problem({ ...decision, minConfidence: 0.8, maxTier: "STANDARD", escalation: "ON_OUTPUT_INVALID" })).not.toBeNull();
  });
});
