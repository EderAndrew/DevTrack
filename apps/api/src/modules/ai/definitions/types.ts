import type { AiModelConfigStatus, AiProviderStatus, AiResourceRef } from "@repo/contracts";
import type { z } from "zod";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import type { PrismaService } from "../../../platform/database/prisma.service";

/**
 * How the next AI specs declare agents, tools, model configs and providers
 * (006 contracts/agent-runtime.md). Everything here is code, reviewed and versioned with the
 * system; `AiRegistrySync` records it in the database at startup (research A4, A5).
 */

/** Risk levels an agent or tool may declare; `L3_ACTION` is refused in this feature (FR-006). */
export type AiDeclarableRiskLevel = "L1_READ_ONLY" | "L2_PROPOSAL";

/** On/off status of a model config or a tool (same values as the contract's config status). */
export type AiSwitchStatus = AiModelConfigStatus;

/** Per-execution limits an agent may lower, never raise (research A17). */
export type AiLimits = AiExecutionLimits;

/**
 * Frozen context of one execution, fixed before the first model call (FR-028, research A7).
 * Nothing the model returns changes it (FR-055).
 */
export interface AiExecutionContext {
  readonly executionId: string;
  readonly userId: string;
  readonly workspaceId: string;
  readonly agentKey: string;
  readonly agentVersionId: string;
  readonly riskLevel: AiDeclarableRiskLevel;
  readonly permissions: readonly string[];
  readonly allowedToolKeys: readonly string[];
  readonly resource: Readonly<AiResourceRef> | null;
  readonly correlationId: string;
  readonly deadline: Date;
  readonly signal: AbortSignal;
}

export interface AgentDefinition {
  key: string;
  name: string;
  description: string;
  /** Bumped on any behavior change (FR-007). */
  version: number;
  initialStatus: "DRAFT" | "ACTIVE";
  riskLevel: AiDeclarableRiskLevel;
  /** Permission that executes the agent; added to the catalog by the agent's own spec. */
  requiredPermission: string;
  prompt: {
    key: string;
    version: number;
    status: "DRAFT" | "ACTIVE" | "DEPRECATED";
    systemInstructions: string;
  };
  /** Strict output schema; required for L2 agents. */
  output?: { version: number; schema: z.ZodType };
  /** Validates the `input` of an execution request (400 on failure). */
  input?: z.ZodType;
  modelConfigKey: string;
  /** Explicit allowlist; `[]` means no tools (FR-034). */
  toolKeys: string[];
  /** Accepted `resource.type` values. */
  resourceTypes: string[];
  /** What a denied tool call does to the execution (default `"fail"`, research A14). */
  onToolDenied?: "continue" | "fail";
  limits?: Partial<AiLimits>;
  /** Required iff `riskLevel` is `L2_PROPOSAL` (research A13). */
  proposal?: {
    type: string;
    itemIds(output: unknown): string[];
  };
  /** Authorized metadata sent to the model as `context` (FR-057). */
  buildContext?(context: AiExecutionContext): Record<string, unknown>;
}

/** What a tool receives: never raw SQL, paths or network built by the model (FR-036, FR-056). */
export interface ToolContext {
  workspaceId: string;
  userId: string;
  executionId: string;
  correlationId: string;
  signal: AbortSignal;
  db: PrismaService;
}

export interface ToolDefinition<I = unknown, O = unknown> {
  key: string;
  name: string;
  description: string;
  riskLevel: "L1_READ_ONLY";
  timeoutMs: number;
  initialStatus: AiSwitchStatus;
  requiredPermission: string;
  resourceType: string;
  /** Strict. */
  inputSchema: z.ZodType<I>;
  /** Strict: only the minimal fields the tool returns (FR-036). */
  outputSchema: z.ZodType<O>;
  resourceIdOf(input: I): string;
  run(context: ToolContext, input: I): Promise<O>;
}

export interface ModelConfigDefinition {
  key: string;
  provider: string;
  model: string;
  initialStatus: AiSwitchStatus;
  parameters?: Record<string, number | string | boolean>;
  maxOutputTokens: number;
  timeoutMs: number;
  /** Prices per million tokens as decimal strings; without them the cost stays empty. */
  price?: { inputPerMTok: string; outputPerMTok: string; currency: string };
  /** Declared only: automatic fallback is not implemented in this feature (FR-017). */
  fallbackKeys?: string[];
}

/** One piece of untrusted content (request input, tool result): data, never instructions. */
export interface UntrustedContent {
  source: string;
  text: string;
}

export interface ModelToolSpec {
  key: string;
  description: string;
  inputJsonSchema: object;
}

export interface ModelToolCall {
  toolKey: string;
  arguments: unknown;
}

export type ModelHistoryEntry =
  | { role: "assistant"; toolCalls: ModelToolCall[] }
  | { role: "tool"; toolKey: string; content: UntrustedContent };

/** What the gateway sends to a provider, already split into trust levels (research A19). */
export interface ModelRequest {
  model: string;
  parameters: Record<string, number | string | boolean>;
  maxOutputTokens: number;
  system: string;
  context: Record<string, unknown>;
  untrusted: UntrustedContent[];
  tools: ModelToolSpec[];
  history: ModelHistoryEntry[];
}

export interface ModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export type ModelResponse = (
  | { kind: "output"; text: string }
  | { kind: "tool_calls"; calls: ModelToolCall[] }
) & { usage: ModelUsage | null };

export type ProviderHealth = AiProviderStatus;

/**
 * A model provider. It throws `ProviderError(category)`, never a raw SDK error, and never
 * exposes its credential (FR-018).
 */
export interface ModelProvider {
  key: string;
  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse>;
  generateStructured(request: ModelRequest, jsonSchema: object, signal: AbortSignal): Promise<ModelResponse>;
  healthCheck(signal: AbortSignal): Promise<ProviderHealth>;
}

/** Ownership check of a resource type inside a teacher's workspace (research A7). */
export interface ResourceOwnership {
  ownedBy(db: PrismaService, workspaceId: string, resourceId: string): Promise<boolean>;
}

/** A tool of any input and output types, as the registry holds them. */
// `any`: `run` and `resourceIdOf` take the input contravariantly, so `unknown` would not accept typed tools.
export type AnyToolDefinition = ToolDefinition<any, any>;

export interface AiDefinitions {
  agents: AgentDefinition[];
  tools: AnyToolDefinition[];
  modelConfigs: ModelConfigDefinition[];
  providers: ModelProvider[];
  resources: Record<string, ResourceOwnership>;
}

/** DI token of the definitions; production uses `PRODUCTION_AI_DEFINITIONS`, tests override it. */
export const AI_DEFINITIONS = Symbol("AI_DEFINITIONS");

export const defineAgent = (definition: AgentDefinition): AgentDefinition => definition;
export const defineTool = <I, O>(definition: ToolDefinition<I, O>): ToolDefinition<I, O> => definition;
export const defineModelConfig = (definition: ModelConfigDefinition): ModelConfigDefinition => definition;
