import { createHash } from "node:crypto";
import { z } from "zod";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import { isModelTier, MODEL_CAPABILITIES, MODEL_LIFECYCLES, MODEL_MODES, PRODUCTION_MODEL_FAMILIES } from "../definitions/model-families";
import type { AgentDefinition, AiDefinitions, AnyToolDefinition, CatalogEntryRejection, CatalogModel, TaskDefinition } from "../definitions/types";

/** A definition in code the foundation refuses; startup stops (006 FR-006, research A4, A5). */
export class AiRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRegistryError";
  }
}

/** SHA-256 of a JSON value with sorted keys, so the same definition always hashes the same. */
export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && typeof v !== "function")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export const jsonSchemaOf = (schema: z.ZodType): object => z.toJSONSchema(schema, { unrepresentable: "any" }) as object;

export const promptHash = (agent: AgentDefinition) => stableHash(agent.prompt.systemInstructions);

export const outputSchemaHash = (agent: AgentDefinition) => (agent.output ? stableHash(jsonSchemaOf(agent.output.schema)) : null);

export const modelConfigHash = (config: CatalogModel) => stableHash(config);

export const taskHash = (task: TaskDefinition) => stableHash(task);

/** Generation parameters a task may set (008 research G11); the provider ignores the rest. */
export const TASK_PARAMETERS: ReadonlySet<string> = new Set(["temperature", "top_p", "effort"]);

export function toolHash(tool: AnyToolDefinition): string {
  return stableHash({ ...tool, inputSchema: jsonSchemaOf(tool.inputSchema), outputSchema: jsonSchemaOf(tool.outputSchema) });
}

/** Everything that defines an agent version's behavior (FR-007). */
export function agentVersionHash(agent: AgentDefinition): string {
  return stableHash({
    riskLevel: agent.riskLevel,
    requiredPermission: agent.requiredPermission,
    prompt: { key: agent.prompt.key, version: agent.prompt.version, hash: promptHash(agent) },
    output: agent.output ? { version: agent.output.version, hash: outputSchemaHash(agent) } : null,
    input: agent.input ? jsonSchemaOf(agent.input) : null,
    taskKey: agent.taskKey,
    toolKeys: [...agent.toolKeys].sort(),
    resourceTypes: [...agent.resourceTypes].sort(),
    onToolDenied: agent.onToolDenied ?? "fail",
    limits: agent.limits ?? {},
    proposalType: agent.proposal?.type ?? null,
  });
}

const KEY = /^[a-z0-9][a-z0-9.-]{1,62}$/;

/** An OpenRouter id (`vendor/model`); `openrouter/*` ids pick other models on their own (008 FR-004). */
const MODEL_ID = /^[a-z0-9-]+\/[a-z0-9._:-]+$/;

export const isValidModelId = (model: string) => MODEL_ID.test(model) && !model.startsWith("openrouter/");

const PRODUCTION_FAMILIES: ReadonlySet<string> = new Set(PRODUCTION_MODEL_FAMILIES);

/** Why one catalog entry can't be used on its own, or null (contracts/catalog-and-quality-gate.md). */
function catalogEntryProblem(entry: CatalogModel, families: ReadonlySet<string>): CatalogEntryRejection | null {
  if (!KEY.test(entry.key)) return "KEY_INVALID";
  if (!families.has(entry.family)) return "FAMILY_NOT_ALLOWED";
  // The family is the id's vendor prefix (research H3); an id without one only outside production.
  if (entry.model.includes("/")) {
    if (!isValidModelId(entry.model)) return "MODEL_INVALID";
    if (entry.model.split("/")[0] !== entry.family) return "FAMILY_MISMATCH";
  } else if (PRODUCTION_FAMILIES.has(entry.family) || !/^[a-z0-9][a-z0-9._:-]*$/.test(entry.model)) {
    return "MODEL_INVALID";
  }
  if (entry.mode === "DECISION" && (entry.capabilities.structuredOutput || entry.capabilities.tools)) return "DECISION_CAPABILITIES";
  const valid =
    isModelTier(entry.tier) &&
    MODEL_MODES.includes(entry.mode) &&
    MODEL_LIFECYCLES.includes(entry.lifecycle) &&
    MODEL_CAPABILITIES.every((capability) => typeof entry.capabilities?.[capability] === "boolean") &&
    Number.isInteger(entry.contextWindow) &&
    entry.contextWindow > 0 &&
    Number.isInteger(entry.maxOutputTokens) &&
    entry.maxOutputTokens > 0 &&
    Number.isInteger(entry.timeoutMs) &&
    entry.timeoutMs >= 100 &&
    entry.timeoutMs <= 600_000 &&
    Number.isInteger(entry.priority ?? 0);
  return valid ? null : "VALUE_INVALID";
}

export interface CatalogCheck {
  accepted: CatalogModel[];
  /** Left out of the catalog, logged `ai.catalog_entry_rejected`; never stops the API (009 FR-027). */
  rejected: { key: string; reason: CatalogEntryRejection }[];
}

/**
 * The catalog entries the policy may use (contracts/catalog-and-quality-gate.md): each checked
 * alone, then one entry per key and per model (the first one wins).
 */
export function checkCatalog(definitions: Pick<AiDefinitions, "modelConfigs" | "families">): CatalogCheck {
  const families = new Set(definitions.families);
  const result: CatalogCheck = { accepted: [], rejected: [] };
  const keys = new Set<string>();
  const models = new Set<string>();
  for (const entry of definitions.modelConfigs) {
    const reason =
      catalogEntryProblem(entry, families) ?? (keys.has(entry.key) ? "KEY_DUPLICATED" : models.has(entry.model) ? "MODEL_DUPLICATED" : null);
    if (reason) {
      result.rejected.push({ key: entry.key, reason });
      continue;
    }
    keys.add(entry.key);
    models.add(entry.model);
    result.accepted.push(entry);
  }
  return result;
}

/**
 * Checks the definitions before anything is written. Messages name keys and versions only,
 * never instructions (FR-018, FR-061). The catalog and the task policies are checked apart
 * (`checkCatalog`, `taskPolicyProblem`): an invalid entry or policy never stops the startup.
 */
export function checkDefinitions(definitions: AiDefinitions, limits: AiExecutionLimits): void {
  const unique = (kind: string, keys: string[]) => {
    const seen = new Set<string>();
    for (const key of keys) {
      if (!KEY.test(key)) throw new AiRegistryError(`${kind} key "${key}" is invalid`);
      if (seen.has(key)) throw new AiRegistryError(`${kind} "${key}" is defined twice`);
      seen.add(key);
    }
  };
  unique("task", definitions.tasks.map((t) => t.key));
  unique("tool", definitions.tools.map((t) => t.key));
  unique("agent", definitions.agents.map((a) => a.key));

  const tasks = new Set(definitions.tasks.map((t) => t.key));
  for (const task of definitions.tasks) {
    const where = `task "${task.key}"`;
    // `preferred_tier` is an enum column: a value outside it is code that doesn't type-check.
    if (!isModelTier(task.preferredTier)) throw new AiRegistryError(`${where}: invalid preferred tier`);
    for (const name of Object.keys(task.parameters ?? {})) {
      if (!TASK_PARAMETERS.has(name)) throw new AiRegistryError(`${where}: parameter "${name}" is not accepted`);
    }
    if (!Number.isInteger(task.maxOutputTokens) || task.maxOutputTokens < 1) throw new AiRegistryError(`${where}: invalid max output tokens`);
    if (!Number.isInteger(task.timeoutMs) || task.timeoutMs < 1000 || task.timeoutMs > 600_000) throw new AiRegistryError(`${where}: invalid timeout`);
  }
  const tools = new Set(definitions.tools.map((t) => t.key));
  for (const tool of definitions.tools) {
    if ((tool.riskLevel as string) !== "L1_READ_ONLY") throw new AiRegistryError(`tool "${tool.key}" must be L1_READ_ONLY`);
  }
  for (const agent of definitions.agents) {
    const where = `agent "${agent.key}"`;
    if (!["L1_READ_ONLY", "L2_PROPOSAL"].includes(agent.riskLevel)) {
      throw new AiRegistryError(`${where}: risk level ${agent.riskLevel} is not accepted in this feature`);
    }
    if (!Number.isInteger(agent.version) || agent.version < 1) throw new AiRegistryError(`${where}: invalid version`);
    if (!tasks.has(agent.taskKey)) throw new AiRegistryError(`${where}: unknown task "${agent.taskKey}"`);
    for (const key of agent.toolKeys) {
      if (!tools.has(key)) throw new AiRegistryError(`${where}: unknown tool "${key}"`);
    }
    if (agent.riskLevel === "L2_PROPOSAL" && (!agent.output || !agent.proposal)) {
      throw new AiRegistryError(`${where}: an L2 agent needs an output schema and a proposal`);
    }
    for (const [name, value] of Object.entries(agent.limits ?? {})) {
      if (typeof value !== "number" || value > limits[name as keyof AiExecutionLimits]) {
        throw new AiRegistryError(`${where}: limit "${name}" above the global one`);
      }
    }
  }
}
