import Anthropic, {
  APIConnectionError,
  APIError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type {
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaOutputConfig,
  BetaTool,
  BetaToolResultBlockParam,
  MessageCreateParamsNonStreaming,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ModelProvider, ModelRequest, ModelResponse, ProviderHealth } from "../../definitions/types";
import { ProviderError, type ProviderErrorCategory } from "../provider-errors";
import { sanitizeJsonSchema } from "./json-schema-sanitize";

/** Server-side refusal fallback, routed by the API (007 research C2). */
export const ANTHROPIC_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** The model `healthCheck` looks up (007 contracts/curriculum-agent.md). */
const HEALTH_MODEL = "claude-opus-5";

const EFFORTS = new Set<string>(["low", "medium", "high", "xhigh", "max"]);

export interface AnthropicProviderOptions {
  apiKey: string;
  /** Only the local E2E run and the unit tests point it at a mock of the Messages API. */
  baseUrl?: string | null;
}

/**
 * Maps an SDK failure to the gateway's category (007 research C3). Only the class and the status
 * are read: the SDK's message, the response body and the request never leave this function.
 */
export function providerErrorCategory(error: unknown): ProviderErrorCategory {
  // Connection failures, the SDK timeout and an aborted call; the gateway already knows when
  // it cancelled or ran out of time itself.
  if (error instanceof APIConnectionError) return "TIMEOUT";
  if (error instanceof RateLimitError) return "RATE_LIMITED";
  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) return "AUTH";
  if (error instanceof BadRequestError || error instanceof NotFoundError) return "INVALID_REQUEST";
  if (error instanceof APIError && typeof error.status === "number") {
    if (error.status === 413) return "INVALID_REQUEST";
    if (error.status >= 500) return "UNAVAILABLE"; // 529 overloaded included
  }
  return "UNKNOWN";
}

/**
 * The Anthropic Messages API as a 006 `ModelProvider` (007 FR-042, contracts/curriculum-agent.md).
 * It translates the 006 envelope and nothing else, and throws only `ProviderError(category)`:
 * never the SDK error, the response body or the key. The SDK does not retry (`maxRetries: 0`);
 * the gateway retries transient failures and bounds each call with the signal.
 *
 * The history is rebuilt from `ModelHistoryEntry`, which carries no thinking blocks, so earlier
 * turns reach the model without their reasoning; the ids of `tool_use` blocks (`call_<n>`) only
 * pair each call with its result.
 */
export class AnthropicProvider implements ModelProvider {
  readonly key = "anthropic";
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey, baseURL: options.baseUrl ?? undefined, maxRetries: 0 });
  }

  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> {
    return this.send(request, null, signal);
  }

  generateStructured(request: ModelRequest, jsonSchema: object, signal: AbortSignal): Promise<ModelResponse> {
    return this.send(request, jsonSchema, signal);
  }

  async healthCheck(signal: AbortSignal): Promise<ProviderHealth> {
    try {
      await this.client.models.retrieve(HEALTH_MODEL, {}, { signal });
      return "UP";
    } catch {
      return "DOWN";
    }
  }

  private async send(request: ModelRequest, jsonSchema: object | null, signal: AbortSignal): Promise<ModelResponse> {
    let message: BetaMessage;
    try {
      message = await this.client.beta.messages.create(body(request, jsonSchema), { signal });
    } catch (error) {
      throw new ProviderError(providerErrorCategory(error));
    }
    return toResponse(message);
  }
}

function body(request: ModelRequest, jsonSchema: object | null): MessageCreateParamsNonStreaming {
  const effort = request.parameters.effort;
  const outputConfig: BetaOutputConfig = {
    ...(typeof effort === "string" && EFFORTS.has(effort) ? { effort: effort as BetaOutputConfig["effort"] } : {}),
    ...(jsonSchema ? { format: { type: "json_schema", schema: sanitizeJsonSchema(jsonSchema) as Record<string, unknown> } } : {}),
  };
  const tools: BetaTool[] = request.tools.map((tool) => ({
    name: tool.key,
    description: tool.description,
    input_schema: sanitizeJsonSchema(tool.inputJsonSchema) as BetaTool.InputSchema,
    strict: true,
  }));
  return {
    model: request.model,
    max_tokens: request.maxOutputTokens,
    system: request.system,
    messages: messagesOf(request),
    thinking: { type: "adaptive" },
    output_config: outputConfig,
    ...(tools.length > 0 ? { tools, tool_choice: { type: "auto" } } : {}),
    betas: [ANTHROPIC_FALLBACK_BETA],
    fallbacks: "default",
  };
}

/**
 * The first user message holds the authorized context (JSON) and the untrusted blocks, already
 * delimited by the prompt envelope. Then each assistant turn's tool calls, and every result of
 * that turn in one user message.
 */
function messagesOf(request: ModelRequest): BetaMessageParam[] {
  const first: BetaContentBlockParam[] = [
    { type: "text", text: JSON.stringify(request.context) },
    ...request.untrusted.map((block): BetaContentBlockParam => ({ type: "text", text: block.text })),
  ];
  const messages: BetaMessageParam[] = [{ role: "user", content: first }];
  const pending: string[] = [];
  let results: BetaToolResultBlockParam[] = [];
  let next = 0;

  const flush = () => {
    if (results.length > 0) messages.push({ role: "user", content: results });
    results = [];
  };
  for (const entry of request.history) {
    if (entry.role === "assistant") {
      flush();
      messages.push({
        role: "assistant",
        content: entry.toolCalls.map((call) => {
          const id = `call_${(next += 1)}`;
          pending.push(id);
          return { type: "tool_use" as const, id, name: call.toolKey, input: call.arguments ?? {} };
        }),
      });
    } else {
      const id = pending.shift();
      if (!id) throw new ProviderError("INVALID_REQUEST"); // a result without its call
      results.push({ type: "tool_result", tool_use_id: id, content: entry.content.text });
    }
  }
  flush();
  return messages;
}

function toResponse(message: BetaMessage): ModelResponse {
  const input = message.usage.input_tokens;
  const output = message.usage.output_tokens;
  const usage = { inputTokens: input, outputTokens: output, totalTokens: input + output };
  if (message.stop_reason === "tool_use") {
    const calls = message.content.flatMap((block) => (block.type === "tool_use" ? [{ toolKey: block.name, arguments: block.input }] : []));
    return { kind: "tool_calls", calls, usage };
  }
  // A truncated or refused answer is no output: the validator fails it (research C3); the refusal
  // category and explanation are never read.
  if (message.stop_reason === "max_tokens" || message.stop_reason === "refusal") return { kind: "output", text: "", usage };
  const text = message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
  return { kind: "output", text, usage };
}
