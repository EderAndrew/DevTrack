import type { AiTaskUnavailableReason } from "@repo/contracts";
import type { Abstract, Type } from "@nestjs/common";
import type { AiModelConfigStatus, AiProviderStatus, AiResourceRef } from "@repo/contracts";
import type { z } from "zod";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import type { PrismaService } from "../../../platform/database/prisma.service";
import type { Tx } from "../../../platform/database/transaction";
import type { ModelCapabilities, ModelCapability, ModelLifecycle, ModelMode, ModelTier } from "./model-families";

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
  /**
   * Status of the agent's first registration; later syncs keep what the admin chose. `DISABLED`
   * waits for the admin to enable it (007 FR-051: after the on-demand eval).
   */
  initialStatus: "DRAFT" | "ACTIVE" | "DISABLED";
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
  /** The task the agent runs (008 research G2); the task picks the models, never the agent. */
  taskKey: string;
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
    /**
     * Builds the proposal from the validated output and the successful tool results, in order
     * (007 research C6). Pure: no I/O. `null` → nothing to propose, and the execution ends
     * COMPLETED without a proposal; a throw → FAILED `AI_OUTPUT_VALIDATION_FAILED`. Without it,
     * the content is the output and the ids come from `itemIds`.
     */
    build?(output: unknown, context: ProposalBuildContext): { content: unknown; itemIds: string[] } | null;
    /**
     * Approval only through the agent's domain (007 research C12.6): `POST /ai/proposals/:id/decision`
     * refuses `APPROVE` and `APPROVE_PARTIALLY` with `409 AI_PROPOSAL_APPLY_REQUIRED`.
     */
    approveThroughDomain?: boolean;
    /**
     * Turns the proposal into the domain's own records (010 research X8), inside the transaction
     * that completes the execution and creates the proposal: a domain whose AI results are born
     * as drafts writes them here. The AI module knows nothing of those records. A throw rolls the
     * whole transaction back (no proposal, no records) and the execution ends FAILED.
     */
    materialize?(tx: Tx, context: ProposalMaterializeContext): Promise<void>;
  };
  /** Authorized metadata sent to the model as `context` (FR-057). */
  buildContext?(context: AiExecutionContext): Record<string, unknown>;
}

/** What `proposal.materialize` gets: the proposal just created and the execution it comes from. */
export interface ProposalMaterializeContext {
  proposalId: string;
  executionId: string;
  workspaceId: string;
  /** The execution's resource (the domain record the proposal is about). */
  resource: AiResourceRef | null;
  /** The content and item ids `build` returned. */
  content: unknown;
  itemIds: readonly string[];
  now: Date;
  /** An application service, e.g. the audit (as `ToolContext.get`). */
  get<T>(token: Type<T> | Abstract<T>): T;
}

/** What `proposal.build` gets besides the output: the successful tool results of the execution, in order. */
export interface ProposalBuildContext {
  toolResults: readonly { toolKey: string; output: unknown }[];
}

/** What a tool receives: never raw SQL, paths or network built by the model (FR-036, FR-056). */
export interface ToolContext {
  workspaceId: string;
  userId: string;
  executionId: string;
  correlationId: string;
  signal: AbortSignal;
  db: PrismaService;
  /**
   * An application service the tool reads through, e.g. the file storage or the syllabus worker
   * runner (007 research C7), so a tool definition stays a constant. Never a way around the checks
   * above: the tool still reads only the resource the executor authorized.
   */
  get<T>(token: Type<T> | Abstract<T>): T;
}

/**
 * Thrown by a tool's `run` to end the call with a specific code (007 research C7): an access
 * refusal (`DENIED`, and the tool returns no content), a timeout (`TIMED_OUT`) or a failure
 * (`FAILED`). Any other error is `FAILED` `AI_TOOL_EXECUTION_FAILED`. It carries no message.
 */
export class ToolRefusal extends Error {
  override readonly name = "ToolRefusal";

  constructor(readonly code: "AI_CONTEXT_ACCESS_DENIED" | "AI_TIMEOUT" | "AI_TOOL_EXECUTION_FAILED") {
    super();
  }
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

/** Reference price per million tokens, as decimal strings; without it the cost stays empty. */
export interface ModelPrice {
  inputPerMTok: string;
  outputPerMTok: string;
  currency: string;
}

/**
 * A model approved for a task (009 research H6): the metrics of a committed evaluation evidence
 * file. It serves the task only when the metrics meet the task's `quality` thresholds.
 */
export interface ModelApproval {
  taskKey: string;
  metrics: Record<string, number>;
  /** ISO timestamp of the evaluation. */
  evaluatedAt: string;
  /** Repository path of the evidence file, e.g. `apps/api/test/fixtures/evaluations/<task>/<model>.json`. */
  evidence: string;
}

/**
 * An entry of the model catalog (009 research H2, contracts/catalog-and-quality-gate.md), synced
 * into `ai_model_configs`. The catalog is the only place with concrete model ids; a task picks
 * among its entries by policy, never by name.
 */
export interface CatalogModel {
  key: string;
  /** Vendor prefix of the id when it has one (research H3); must be in `AiDefinitions.families`. */
  family: string;
  provider: string;
  model: string;
  tier: ModelTier;
  mode: ModelMode;
  lifecycle: ModelLifecycle;
  /** Status of the first registration; afterwards it is the admin's (006). */
  initialStatus: AiSwitchStatus;
  parameters?: Record<string, number | string | boolean>;
  maxOutputTokens: number;
  timeoutMs: number;
  price?: ModelPrice;
  contextWindow: number;
  capabilities: ModelCapabilities;
  /** Higher first on a cost tie (default 0). */
  priority?: number;
  approvals?: ModelApproval[];
}

/** Why a catalog entry was left out at startup, logged `ai.catalog_entry_rejected` (009 FR-027). */
export type CatalogEntryRejection =
  | "KEY_INVALID"
  | "KEY_DUPLICATED"
  | "FAMILY_NOT_ALLOWED"
  | "FAMILY_MISMATCH"
  | "MODEL_INVALID"
  | "MODEL_DUPLICATED"
  | "DECISION_CAPABILITIES"
  | "VALUE_INVALID"
  | "LIFECYCLE_TRANSITION_INVALID";

/** Why a task can't run, logged once per startup as `ai.task_unavailable`. */
export type TaskUnavailableReason = AiTaskUnavailableReason;

/**
 * What an agent asks the gateway for and the model policy that picks its models (009 research H5,
 * contracts/model-policy.md): the route is chosen per request by `selectRoute` and fixed on the
 * execution (008 G5). The chosen config's own tokens and timeout act as ceilings.
 */
export interface TaskDefinition {
  key: string;
  mode: ModelMode;
  minimumTier: ModelTier;
  preferredTier: ModelTier;
  /** Escalation ceiling; defaults to `preferredTier` (no escalation). */
  maxTier?: ModelTier;
  /** Subset of `AiDefinitions.families`. */
  allowedFamilies: string[];
  requiredCapabilities: ModelCapability[];
  /** `SAME_TIER`: a fallback of the same tier, of another family when possible (009 FR-012). */
  fallback: "SAME_TIER" | "NONE";
  /** `ON_OUTPUT_INVALID`: once, to the next tier, when the output fails validation (009 FR-013). */
  escalation: "NONE" | "ON_OUTPUT_INVALID";
  /** Metric thresholds an approval must meet, e.g. `{ itemRecall: 0.9, schemaValidity: 1 }`. */
  quality: Record<string, number>;
  /** Tokens of a typical call, for the estimated cost that orders the candidates. */
  typicalUsage: { inputTokens: number; outputTokens: number };
  /** DECISION only: answers below it are `UNDECIDED`; within `(0.5, 1]`. */
  minConfidence?: number;
  /** Only `temperature`, `top_p` and `effort` (checked at startup). */
  parameters?: Record<string, number | string | boolean>;
  maxOutputTokens: number;
  timeoutMs: number;
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
  /** What the provider says the call cost, when it reports it (008 research G17). */
  cost?: { amount: string; currency: string } | null;
}

export type ModelResponse = (
  | { kind: "output"; text: string }
  | { kind: "tool_calls"; calls: ModelToolCall[] }
) & {
  usage: ModelUsage | null;
  /** The model the provider says it served; absent or null when it doesn't say (008 research G12). */
  servedModel?: string | null;
};

export type ProviderHealth = AiProviderStatus;

/** A question to a decision model (009 contracts/decisions-provider.md). */
export type DecisionQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  /** 2–10 levels, from the lowest to the highest. */
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria: { true: string; false: string } };

/** What the gateway sends to a decision provider: the state is untrusted content, as-is. */
export interface DecisionRequest {
  model: string;
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, DecisionQuestion>;
}

export type DecisionAnswer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; probabilities: Record<string, number>; confidence: number }
  | { type: "noul"; noul: number };

export interface DecisionResponse {
  answers: Record<string, DecisionAnswer>;
  usage: ModelUsage | null;
  servedModel?: string | null;
}

/**
 * A model provider. It throws `ProviderError(category)`, never a raw SDK error, and never
 * exposes its credential (FR-018).
 */
export interface ModelProvider {
  key: string;
  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse>;
  generateStructured(request: ModelRequest, jsonSchema: object, signal: AbortSignal): Promise<ModelResponse>;
  healthCheck(signal: AbortSignal): Promise<ProviderHealth>;
  /** Decision mode (009 research H10); only providers of decision models implement it. */
  decide?(request: DecisionRequest, signal: AbortSignal): Promise<DecisionResponse>;
}

/** Ownership check of a resource type inside a teacher's workspace (research A7). */
export interface ResourceOwnership {
  /** `db` is the client or the caller's transaction. */
  ownedBy(db: Tx, workspaceId: string, resourceId: string): Promise<boolean>;
}

/** A tool of any input and output types, as the registry holds them. */
// `any`: `run` and `resourceIdOf` take the input contravariantly, so `unknown` would not accept typed tools.
export type AnyToolDefinition = ToolDefinition<any, any>;

export interface AiDefinitions {
  agents: AgentDefinition[];
  tools: AnyToolDefinition[];
  /** The model catalog (009 research H2), synced into `ai_model_configs`. */
  modelConfigs: CatalogModel[];
  tasks: TaskDefinition[];
  /**
   * The model families in force (009 FR-001): production = `PRODUCTION_MODEL_FAMILIES`; the tests
   * add `fake`, which never reaches production.
   */
  families: readonly string[];
  providers: ModelProvider[];
  resources: Record<string, ResourceOwnership>;
}

/** DI token of the definitions; production uses `productionAiDefinitions(config)`, tests override it. */
export const AI_DEFINITIONS = Symbol("AI_DEFINITIONS");

export const defineAgent = (definition: AgentDefinition): AgentDefinition => definition;
export const defineTool = <I, O>(definition: ToolDefinition<I, O>): ToolDefinition<I, O> => definition;
export const defineCatalogModel = (definition: CatalogModel): CatalogModel => definition;
export const defineTask = (definition: TaskDefinition): TaskDefinition => definition;
