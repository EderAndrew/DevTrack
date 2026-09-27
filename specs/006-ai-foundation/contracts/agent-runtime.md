# Agent Runtime Contract: 006 — AI Foundation

This is the internal contract that the next AI specs follow (Curriculum Agent first). It
covers how to declare an agent, a tool, a model config and a provider, and what the
foundation does with them. The types live in `apps/api/src/modules/ai/definitions/types.ts`.
No domain module imports anything else from `modules/ai`, except `AiExecutionService` and
`AiProposalService` (research A3, A15).

## Definitions (`AI_DEFINITIONS`)

```ts
interface AiDefinitions {
  agents: AgentDefinition[];
  tools: ToolDefinition[];
  modelConfigs: ModelConfigDefinition[];
  providers: ModelProvider[];                        // production: [] in this feature (FR-016)
  resources: Record<string, ResourceOwnership>;      // resourceType → ownership resolver
}

interface AgentDefinition {
  key: string; name: string; description: string;
  version: number;                                   // bump on any behavior change (FR-007)
  initialStatus: "DRAFT" | "ACTIVE";
  riskLevel: "L1_READ_ONLY" | "L2_PROPOSAL";         // L3 rejected at sync (FR-006)
  requiredPermission: string;                        // added by the agent's spec migration
  prompt: { key: string; version: number; status: "DRAFT" | "ACTIVE" | "DEPRECATED"; systemInstructions: string };
  output?: { version: number; schema: z.ZodType };   // strict; required for L2
  input?: z.ZodType;                                 // validates `input` of the request (400)
  modelConfigKey: string;                            // 008: replaced by taskKey (see "Tarefas e fallback")
  toolKeys: string[];                                // explicit allowlist; [] = no tools
  resourceTypes: string[];                           // accepted `resource.type`
  onToolDenied?: "continue" | "fail";                // default "fail"
  limits?: Partial<AiLimits>;                        // only lower than the global ones
  proposal?: {                                       // required iff L2
    type: string;
    itemIds(output: unknown): string[];
  };
  buildContext?(ctx: AiExecutionContext): Record<string, unknown>;   // authorized metadata only (FR-057)
}

interface ToolDefinition<I, O> {
  key: string; name: string; description: string;
  riskLevel: "L1_READ_ONLY";
  timeoutMs: number;
  initialStatus: "ENABLED" | "DISABLED";
  requiredPermission: string;
  resourceType: string;
  inputSchema: z.ZodType<I>;                         // strict
  outputSchema: z.ZodType<O>;                        // strict: minimal fields (FR-036)
  resourceIdOf(input: I): string;
  run(ctx: ToolContext, input: I): Promise<O>;       // ctx: {workspaceId, userId, executionId, correlationId, signal, db}
}

interface ModelConfigDefinition {
  key: string; provider: string; model: string;
  initialStatus: "ENABLED" | "DISABLED";
  parameters?: Record<string, number | string | boolean>;
  maxOutputTokens: number; timeoutMs: number;
  price?: { inputPerMTok: string; outputPerMTok: string; currency: string };
  fallbackKeys?: string[];                           // declared only; not used (FR-017)
}

interface ModelProvider {
  key: string;
  generate(req: ModelRequest, signal: AbortSignal): Promise<ModelResponse>;
  generateStructured(req: ModelRequest, jsonSchema: object, signal: AbortSignal): Promise<ModelResponse>;
  healthCheck(signal: AbortSignal): Promise<"UP" | "DOWN" | "NOT_CONFIGURED">;
}

interface ResourceOwnership {
  ownedBy(db: PrismaService, workspaceId: string, resourceId: string): Promise<boolean>;
}
```

`ModelRequest` is `{model, parameters, maxOutputTokens, system, context, untrusted:
{source, text}[], tools: {key, description, inputJsonSchema}[], history}`.

`ModelResponse` is `{kind: "output", text} | {kind: "tool_calls", calls: {toolKey,
arguments}[]}`, plus `usage | null`. A provider throws `ProviderError(category)`, never a
raw SDK error.

## Execution cycle (`AiExecutionRunner`)

```text
request (HTTP, one transaction)
  checks of http-api.md → INSERT ai_executions QUEUED + transition + ai_execution.requested
  → commit → worker.kick() → 202

worker cycle (runOnce(now))
  1. sweep: non-final with deadline_at < now → TIMED_OUT (AI_TIMEOUT); proposals past expires_at → EXPIRED
  2. claim ≤ 2 QUEUED (FOR UPDATE SKIP LOCKED) → RUNNING, claim_token, lease = deadline
  3. per execution:
     a. re-authorize (FR-032): agent ACTIVE? (else CANCELLED/AI_AGENT_DISABLED), config ENABLED?
        (else FAILED/AI_MODEL_UNAVAILABLE), user still holds requiredPermission and the resource
        is still owned? (else FAILED/AI_CONTEXT_ACCESS_DENIED) → frozen AiExecutionContext; step CONTEXT_RESOLVED
     b. loop (≤ max model calls):
          cancelled? → CANCELLED
          gateway.call → ai_model_calls row; error → FAILED/TIMED_OUT with the normalized code
          tool_calls → WAITING_TOOL; each through AiToolExecutor (≤ max tool calls) → RUNNING
          output → leave the loop
        over a limit → FAILED/AI_EXECUTION_LIMIT_EXCEEDED
     c. VALIDATING_OUTPUT → StructuredOutputValidator → FAILED/AI_OUTPUT_* on error
     d. one transaction, only if the claim_token still matches and cancel_requested_at IS NULL:
        COMPLETED + (L1: ai_execution_outputs | L2: ai_proposals READY_FOR_REVIEW)
        + usage counters + transitions + audit
```

Every status write is conditional on `claim_token`. A late writer (lost lease, a second
instance) changes nothing (FR-024).

## Guarantees for the next agents

- The agent never sees the provider, the model or credentials, and asks only for its task
  (`taskKey`, since 008; `modelConfigKey` before it).
- The workspace, permissions, tools and risk level are fixed before the first model call.
  The model's output can't change them.
- Every tool call passes the checks of research A14.
- Untrusted content always travels in `untrusted` (research A19).
- Only a validated output becomes a result or a proposal. The foundation never writes to
  domain tables. Applying an approved proposal is a domain-module flow in the agent's
  spec, which reads the proposal through `AiProposalService.getApproved(workspaceId, id)`
  and runs the domain's own validations.
- Before production, each agent brings evaluation cases (`AiEvaluationStore`) and its
  quality thresholds (constitution XIX).

## Tarefas e fallback (008)

Since `specs/008-ai-gateway-openrouter`, an agent declares the task it runs, never a model
config (details in `specs/008-ai-gateway-openrouter/contracts/gateway-routing.md`):

```ts
const MY_TASK = defineTask({
  key: "my-task",
  primaryModelConfigKey: "openrouter-default",      // DEFAULT_MODEL_CONFIG_KEY
  fallbackModelConfigKey: "openrouter-fallback",    // optional
  parameters: { effort: "low" },                    // only temperature, top_p, effort
  maxOutputTokens: 16_000,
  timeoutMs: 60_000,
});

const MY_AGENT = defineAgent({ /* ...as above, without modelConfigKey */ taskKey: MY_TASK.key });
```

Both go into `AiDefinitions` (`tasks` next to `agents`). The agent then gets, with no code of
its own: the provider and its credential, retries, the fallback after a recoverable failure,
the circuit per model config, the per-agent hourly limit, usage and cost per call, the
`ai.model_call` logs and the audit events. Its tests register it with `createAiTestApp({ agents,
tasks })` on the fake provider; `apps/api/test/fixtures/ai/reference-routed.ts` is the example
(`008-us7-reuse.spec.ts`).
