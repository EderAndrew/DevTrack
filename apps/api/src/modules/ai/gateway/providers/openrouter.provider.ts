import type {
  DecisionAnswer,
  DecisionRequest,
  DecisionResponse,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelToolCall,
  ModelUsage,
  ProviderHealth,
} from "../../definitions/types";
import { ProviderError, type ProviderErrorCategory } from "../provider-errors";
import { sanitizeJsonSchema } from "./json-schema-sanitize";

/** The only place the OpenRouter host appears (008 research G10). */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const EFFORTS = new Set<string>(["minimal", "low", "medium", "high"]);

export interface OpenRouterProviderOptions {
  apiKey: string;
  /** Only the local E2E run points it at a mock; production uses `OPENROUTER_BASE_URL`. */
  baseUrl?: string | null;
  /** Injected by the unit tests. */
  fetch?: typeof fetch;
}

type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: { type: "text"; text: string }[] }
  | { role: "assistant"; content: null; tool_calls: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface Completion {
  model?: unknown;
  choices?: { finish_reason?: unknown; message?: { content?: unknown; tool_calls?: { function?: { name?: unknown; arguments?: unknown } }[] } }[];
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; cost?: unknown };
  error?: { code?: unknown; metadata?: unknown };
}

/** The body of `POST /api/alpha/decisions` (009 contracts/decisions-provider.md). */
interface Decisions {
  model?: unknown;
  answers?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown; cost?: unknown };
  error?: { code?: unknown; metadata?: unknown };
}

/**
 * Maps an HTTP status (or the `error.code` of a 200 body) to the gateway's category (008 research
 * G13). Only the number and whether moderation metadata exist are read, never the message.
 */
export function openRouterErrorCategory(status: number, moderated = false): ProviderErrorCategory {
  if (status === 403) return moderated ? "INVALID_REQUEST" : "AUTH";
  if (status === 400 || status === 404 || status === 413 || status === 422) return "INVALID_REQUEST";
  if (status === 401 || status === 402) return "AUTH";
  if (status === 408) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 500 || status === 502 || status === 503 || status === 504 || status === 529) return "UNAVAILABLE";
  return "UNKNOWN";
}

/**
 * OpenRouter's chat completions API as a 006 `ModelProvider` over Node's `fetch` (008 FR-004,
 * contracts/openrouter-provider.md). It translates the 006 envelope and nothing else, asks for no
 * retention or training, and throws only `ProviderError(category)`: never the response body, the
 * request or the key. It never retries; the gateway retries and bounds each call with the signal.
 */
export class OpenRouterProvider implements ModelProvider {
  readonly key = "openrouter";
  readonly #apiKey: string;
  readonly #baseUrl: string;
  /** The decisions route lives outside `/api/v1` (009 research H10). */
  readonly #origin: string;
  readonly #fetch: typeof fetch;

  constructor(options: OpenRouterProviderOptions) {
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? OPENROUTER_BASE_URL).replace(/\/+$/, "");
    this.#origin = new URL(this.#baseUrl).origin;
    this.#fetch = options.fetch ?? fetch;
  }

  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> {
    return this.send(request, null, signal);
  }

  generateStructured(request: ModelRequest, jsonSchema: object, signal: AbortSignal): Promise<ModelResponse> {
    return this.send(request, jsonSchema, signal);
  }

  /**
   * Decision mode (009 FR-001a, contracts/decisions-provider.md): the state and the questions,
   * nothing that identifies the teacher. Each answer takes the asked question's type; the gateway
   * validates the values. Errors as in `generate`, plus 524 (edge timeout) as `TIMEOUT`.
   */
  async decide(request: DecisionRequest, signal: AbortSignal): Promise<DecisionResponse> {
    const payload = JSON.stringify({ model: request.model, state: request.state, questions: request.questions });
    let status: number;
    let body: Decisions;
    try {
      const res = await this.#fetch(`${this.#origin}/api/alpha/decisions`, { method: "POST", headers: this.headers(), body: payload, signal });
      status = res.status;
      body = (await res.json().catch(() => null)) as Decisions;
    } catch {
      throw new ProviderError("UNAVAILABLE");
    }
    const category = (code: number) => (code === 524 ? "TIMEOUT" : openRouterErrorCategory(code, isModerated(body)));
    if (status !== 200) throw new ProviderError(category(status));
    if (!body || typeof body !== "object") throw new ProviderError("UNKNOWN");
    if (body.error) throw new ProviderError(typeof body.error.code === "number" ? category(body.error.code) : "UNKNOWN");
    if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) throw new ProviderError("UNKNOWN");
    const servedModel = typeof body.model === "string" ? body.model : null;
    if (servedModel !== null && !servedModel.startsWith(request.model)) throw new ProviderError("UNKNOWN");
    const answers = Object.fromEntries(
      Object.entries(body.answers as Record<string, unknown>).map(([id, answer]) => [id, decisionAnswer(answer, request.questions[id]?.type)]),
    );
    return { answers, usage: decisionUsage(body.usage), servedModel };
  }

  async healthCheck(signal: AbortSignal): Promise<ProviderHealth> {
    try {
      const res = await this.#fetch(`${this.#baseUrl}/key`, { method: "GET", headers: this.headers(), signal });
      await res.body?.cancel();
      return res.status === 200 ? "UP" : "DOWN";
    } catch {
      return "DOWN";
    }
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.#apiKey}`, "Content-Type": "application/json", "X-Title": "DevTrack" };
  }

  private async send(request: ModelRequest, jsonSchema: object | null, signal: AbortSignal): Promise<ModelResponse> {
    const payload = JSON.stringify(body(request, jsonSchema));
    let status: number;
    let completion: Completion;
    try {
      const res = await this.#fetch(`${this.#baseUrl}/chat/completions`, { method: "POST", headers: this.headers(), body: payload, signal });
      status = res.status;
      completion = (await res.json().catch(() => null)) as Completion;
    } catch {
      // Network failure or abort; the gateway already knows when it cancelled or ran out of time.
      throw new ProviderError("UNAVAILABLE");
    }
    if (status !== 200) throw new ProviderError(openRouterErrorCategory(status, isModerated(completion)));
    if (!completion || typeof completion !== "object") throw new ProviderError("UNKNOWN");
    if (completion.error) {
      const code = completion.error.code;
      throw new ProviderError(typeof code === "number" ? openRouterErrorCategory(code, isModerated(completion)) : "UNKNOWN");
    }
    return toResponse(completion, request.model);
  }
}

function isModerated(completion: Completion | Decisions | null): boolean {
  const metadata = completion?.error?.metadata;
  return typeof metadata === "object" && metadata !== null && "reasons" in metadata;
}

function body(request: ModelRequest, jsonSchema: object | null): Record<string, unknown> {
  const { temperature, top_p: topP, effort } = request.parameters;
  const tools = request.tools.map((tool) => ({
    type: "function",
    function: { name: tool.key, description: tool.description, parameters: sanitizeJsonSchema(tool.inputJsonSchema), strict: true },
  }));
  return {
    model: request.model,
    messages: messagesOf(request),
    max_tokens: request.maxOutputTokens,
    ...(typeof temperature === "number" ? { temperature } : {}),
    ...(typeof topP === "number" ? { top_p: topP } : {}),
    ...(typeof effort === "string" && EFFORTS.has(effort) ? { reasoning: { effort } } : {}),
    ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    ...(jsonSchema ? { response_format: { type: "json_schema", json_schema: { name: "output", strict: true, schema: sanitizeJsonSchema(jsonSchema) } } } : {}),
    provider: { data_collection: "deny", zdr: true, require_parameters: true },
    usage: { include: true },
    stream: false,
  };
}

/**
 * The system instructions, then one user message with the authorized context (JSON) and the
 * untrusted blocks, already delimited by the prompt envelope; then each assistant turn's tool
 * calls and one `tool` message per result. The ids (`call_<n>`) only pair a call with its result.
 */
function messagesOf(request: ModelRequest): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: request.system },
    {
      role: "user",
      content: [{ type: "text", text: JSON.stringify(request.context) }, ...request.untrusted.map((block) => ({ type: "text" as const, text: block.text }))],
    },
  ];
  const pending: string[] = [];
  let next = 0;
  for (const entry of request.history) {
    if (entry.role === "assistant") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: entry.toolCalls.map((call) => {
          const id = `call_${(next += 1)}`;
          pending.push(id);
          return { id, type: "function" as const, function: { name: call.toolKey, arguments: JSON.stringify(call.arguments ?? {}) } };
        }),
      });
    } else {
      const id = pending.shift();
      if (!id) throw new ProviderError("INVALID_REQUEST"); // a result without its call
      messages.push({ role: "tool", tool_call_id: id, content: entry.content.text });
    }
  }
  return messages;
}

const count = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function usageOf(usage: Completion["usage"]): ModelUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const cost = count(usage.cost);
  return {
    inputTokens: count(usage.prompt_tokens),
    outputTokens: count(usage.completion_tokens),
    totalTokens: count(usage.total_tokens),
    cost: cost === null ? null : { amount: String(cost), currency: "USD" },
  };
}

function parseArguments(raw: unknown): unknown {
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined; // the tool executor's strict schema refuses it
  }
}

function toResponse(completion: Completion, requestedModel: string): ModelResponse {
  const choice = completion.choices?.[0];
  if (!choice) throw new ProviderError("UNKNOWN");
  // OpenRouter may add a dated suffix, never serve another model (008 research G12).
  const servedModel = typeof completion.model === "string" ? completion.model : null;
  if (servedModel !== null && !servedModel.startsWith(requestedModel)) throw new ProviderError("UNKNOWN");
  const usage = usageOf(completion.usage);

  if (choice.finish_reason === "tool_calls") {
    const calls: ModelToolCall[] = (choice.message?.tool_calls ?? []).map((call) => ({
      toolKey: typeof call.function?.name === "string" ? call.function.name : "",
      arguments: parseArguments(call.function?.arguments),
    }));
    return { kind: "tool_calls", calls, usage, servedModel };
  }
  // A truncated, filtered or failed answer is no output: the validator fails it (008 research G7).
  if (choice.finish_reason !== "stop") return { kind: "output", text: "", usage, servedModel };
  const content = choice.message?.content;
  return { kind: "output", text: typeof content === "string" ? content : "", usage, servedModel };
}

/**
 * One decision answer under the asked type (the wire carries only the values); an id nobody asked
 * keeps the wire's `type`, if any, so the gateway refuses it. Only the known fields are kept.
 */
function decisionAnswer(raw: unknown, askedType: DecisionAnswer["type"] | undefined): DecisionAnswer {
  const answer = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const type = (askedType ?? answer.type) as DecisionAnswer["type"];
  if (type === "noul") return { type, noul: answer.noul as number };
  const common = { probabilities: answer.probabilities as Record<string, number>, confidence: answer.confidence as number };
  if (type === "score") return { type, score: answer.score as number, ...common };
  return { type, choice: answer.choice as string, ...common };
}

function decisionUsage(usage: Decisions["usage"]): ModelUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const input = count(usage.input_tokens);
  const output = count(usage.output_tokens);
  const cost = count(usage.cost);
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input !== null && output !== null ? input + output : null,
    cost: cost === null ? null : { amount: String(cost), currency: "USD" },
  };
}
