import { createHash } from "node:crypto";
import { z } from "zod";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import type { AgentDefinition, AiDefinitions, AnyToolDefinition, ModelConfigDefinition } from "../definitions/types";

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

export const modelConfigHash = (config: ModelConfigDefinition) => stableHash(config);

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
    modelConfigKey: agent.modelConfigKey,
    toolKeys: [...agent.toolKeys].sort(),
    resourceTypes: [...agent.resourceTypes].sort(),
    onToolDenied: agent.onToolDenied ?? "fail",
    limits: agent.limits ?? {},
    proposalType: agent.proposal?.type ?? null,
  });
}

const KEY = /^[a-z0-9][a-z0-9.-]{1,62}$/;

/**
 * Checks the definitions before anything is written. Messages name keys and versions only,
 * never instructions (FR-018, FR-061).
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
  unique("model config", definitions.modelConfigs.map((c) => c.key));
  unique("tool", definitions.tools.map((t) => t.key));
  unique("agent", definitions.agents.map((a) => a.key));

  const configs = new Set(definitions.modelConfigs.map((c) => c.key));
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
    if (!configs.has(agent.modelConfigKey)) throw new AiRegistryError(`${where}: unknown model config "${agent.modelConfigKey}"`);
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
