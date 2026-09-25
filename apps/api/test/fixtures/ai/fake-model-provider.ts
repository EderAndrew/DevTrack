import type { ModelProvider, ModelRequest, ModelResponse, ModelToolCall, ModelUsage, ProviderHealth } from "../../../src/modules/ai/definitions/types";
import { ProviderError, type ProviderErrorCategory } from "../../../src/modules/ai/gateway/provider-errors";

/**
 * One programmed answer of the fake provider (006 FR-015, research A12). `delayMs` waits before
 * answering (the gateway's timeout and cancellation still apply); `usage: null` means the provider
 * does not report token usage.
 */
export type FakeStep = (
  | { output: unknown }
  | { text: string }
  | { empty: true }
  | { toolCalls: ModelToolCall[] }
  | { error: ProviderErrorCategory }
) & { delayMs?: number; usage?: ModelUsage | null };

export const fakeOutput = (output: unknown, extra: Partial<FakeStep> = {}): FakeStep => ({ output, ...extra }) as FakeStep;
export const fakeText = (text: string): FakeStep => ({ text });
export const fakeEmpty = (): FakeStep => ({ empty: true });
export const fakeToolCall = (toolKey: string, args: unknown): FakeStep => ({ toolCalls: [{ toolKey, arguments: args }] });
export const fakeError = (category: ProviderErrorCategory): FakeStep => ({ error: category });
export const fakeDelay = (ms: number, then: FakeStep): FakeStep => ({ ...then, delayMs: ms });

const DEFAULT_USAGE: ModelUsage = { inputTokens: 120, outputTokens: 30, totalTokens: 150 };

/** A credential the fake "holds", so scans can prove it never leaks (006/SC-007). */
export const FAKE_PROVIDER_CREDENTIAL = "sk-fake-006-credencial-que-nunca-aparece";

interface Script {
  matches(request: ModelRequest): boolean;
  steps: FakeStep[];
}

/**
 * Programmable provider for every automated test: never touches the network (006/SC-011). A
 * script is a queue of steps consumed one per call; the last step of the default script repeats
 * so that "a model that never stops asking for tools" is one step. `requests` keeps every request
 * for the minimization and prompt-injection assertions.
 */
export class FakeModelProvider implements ModelProvider {
  readonly requests: ModelRequest[] = [];
  readonly structuredSchemas: object[] = [];
  health: ProviderHealth = "UP";
  private scripts: Script[] = [];
  private defaults: FakeStep[] = [];
  /** Held like a real provider would hold its key; never returned, logged nor thrown. */
  private readonly credential: string;

  constructor(
    readonly key = "fake",
    credential = FAKE_PROVIDER_CREDENTIAL,
  ) {
    this.credential = credential;
  }

  /** Steps for any request not matched by `scriptWhen`; the last one repeats. */
  script(...steps: FakeStep[]): this {
    this.defaults = [...steps];
    return this;
  }

  /** Steps for the requests `matches` accepts (e.g. by a marker in the untrusted input). */
  scriptWhen(matches: (request: ModelRequest) => boolean, ...steps: FakeStep[]): this {
    this.scripts.push({ matches, steps: [...steps] });
    return this;
  }

  reset(): void {
    this.requests.length = 0;
    this.structuredSchemas.length = 0;
    this.scripts = [];
    this.defaults = [];
    this.health = "UP";
  }

  generate(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> {
    return this.answer(request, signal);
  }

  generateStructured(request: ModelRequest, jsonSchema: object, signal: AbortSignal): Promise<ModelResponse> {
    this.structuredSchemas.push(jsonSchema);
    return this.answer(request, signal);
  }

  async healthCheck(): Promise<ProviderHealth> {
    return this.credential ? this.health : "NOT_CONFIGURED";
  }

  private nextStep(request: ModelRequest): FakeStep {
    const script = this.scripts.find((candidate) => candidate.matches(request) && candidate.steps.length > 0);
    if (script) return script.steps.length > 1 ? script.steps.shift()! : script.steps[0]!;
    if (this.defaults.length === 0) throw new ProviderError("UNKNOWN");
    return this.defaults.length > 1 ? this.defaults.shift()! : this.defaults[0]!;
  }

  private async answer(request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> {
    this.requests.push(structuredClone(request));
    const step = this.nextStep(request);
    if (step.delayMs) await abortableSleep(step.delayMs, signal);
    const usage = step.usage === undefined ? DEFAULT_USAGE : step.usage;
    if ("error" in step) throw new ProviderError(step.error);
    if ("toolCalls" in step) return { kind: "tool_calls", calls: step.toolCalls, usage };
    if ("empty" in step) return { kind: "output", text: "", usage };
    if ("text" in step) return { kind: "output", text: step.text, usage };
    return { kind: "output", text: JSON.stringify(step.output), usage };
  }
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ProviderError("TIMEOUT"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new ProviderError("TIMEOUT"));
      },
      { once: true },
    );
  });
}
