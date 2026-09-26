import { Inject, Injectable } from "@nestjs/common";
import type { AiModelConfigStatus } from "@repo/contracts";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import { AI_DEFINITIONS, type AiDefinitions, type ModelProvider, type ModelRequest, type ModelResponse } from "../definitions/types";
import { AiFailure, PROVIDER_ERROR_CODES, ProviderError, type ProviderErrorCategory } from "./provider-errors";
import { backoffMs, isTransient } from "./retry-policy";

/** The parts of a model config the gateway needs; never a credential (006/FR-018). */
export interface GatewayModelConfig {
  key: string;
  provider: string;
  model: string;
  status: AiModelConfigStatus;
  parameters: Record<string, number | string | boolean>;
  maxOutputTokens: number;
  timeoutMs: number;
}

export interface GatewayCall {
  config: GatewayModelConfig;
  /** Everything but the model fields, which come from the config (006/FR-012). */
  request: Omit<ModelRequest, "model" | "parameters" | "maxOutputTokens">;
  limits: AiExecutionLimits;
  /** Total deadline of the execution; never retried past it (research A9). */
  deadline: Date;
  /** Aborted when the execution is cancelled. */
  signal: AbortSignal;
  /** JSON Schema of the agent's output, for providers that support structured output. */
  structuredSchema?: object;
}

export interface GatewayResult {
  response: ModelResponse;
  attempts: number;
  durationMs: number;
}

type Outcome = { ok: true; response: ModelResponse } | { ok: false; reason: "cancelled" | "deadline" } | { ok: false; category: ProviderErrorCategory };

/**
 * The only way to a model (006 FR-001, FR-014, research A12): picks the provider of the config,
 * enforces the per-call timeout, the deadline and cancellation even if the provider ignores its
 * signal, retries only transient failures with growing waits, and normalizes every failure into
 * an `AiFailure`. It never logs nor returns provider messages.
 */
@Injectable()
export class ModelGateway {
  /** Replaced in tests to avoid real waits. */
  timing: { sleep(ms: number): Promise<void>; random(): number } = {
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
  };

  constructor(@Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions) {}

  providerFor(key: string): ModelProvider | undefined {
    return this.definitions.providers.find((provider) => provider.key === key);
  }

  async call(call: GatewayCall): Promise<GatewayResult> {
    const started = Date.now();
    const provider = this.providerFor(call.config.provider);
    if (call.config.status !== "ENABLED" || !provider) throw new AiFailure("AI_MODEL_UNAVAILABLE", 0, 0);

    const request: ModelRequest = {
      ...call.request,
      model: call.config.model,
      parameters: call.config.parameters,
      maxOutputTokens: call.config.maxOutputTokens,
    };
    const perCallMs = Math.min(call.config.timeoutMs, call.limits.modelCallTimeoutMs);
    let attempts = 0;

    for (;;) {
      if (call.signal.aborted) throw new AiFailure("AI_EXECUTION_CANCELLED", attempts, Date.now() - started);
      const remaining = call.deadline.getTime() - Date.now();
      if (remaining <= 0) throw new AiFailure("AI_TIMEOUT", attempts, Date.now() - started);

      attempts += 1;
      const outcome = await this.attempt(provider, request, call, Math.min(perCallMs, remaining), remaining <= perCallMs);
      if (outcome.ok) return { response: outcome.response, attempts, durationMs: Date.now() - started };
      if ("reason" in outcome) {
        throw new AiFailure(outcome.reason === "cancelled" ? "AI_EXECUTION_CANCELLED" : "AI_TIMEOUT", attempts, Date.now() - started);
      }
      if (!isTransient(outcome.category) || attempts > call.limits.maxRetries) {
        throw new AiFailure(PROVIDER_ERROR_CODES[outcome.category], attempts, Date.now() - started);
      }
      const wait = backoffMs(attempts - 1, this.timing.random);
      if (Date.now() + wait >= call.deadline.getTime()) {
        throw new AiFailure(PROVIDER_ERROR_CODES[outcome.category], attempts, Date.now() - started);
      }
      await this.timing.sleep(wait);
    }
  }

  /** One provider call bounded by `timeoutMs`; `deadlineBound` says the timeout is the deadline itself. */
  private attempt(provider: ModelProvider, request: ModelRequest, call: GatewayCall, timeoutMs: number, deadlineBound: boolean): Promise<Outcome> {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, call.signal]);
    return new Promise<Outcome>((resolve) => {
      const onCancel = () => finish({ ok: false, reason: "cancelled" });
      const timer = setTimeout(() => finish(deadlineBound ? { ok: false, reason: "deadline" } : { ok: false, category: "TIMEOUT" }), timeoutMs);
      let done = false;
      function finish(outcome: Outcome) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        call.signal.removeEventListener("abort", onCancel);
        controller.abort();
        resolve(outcome);
      }
      call.signal.addEventListener("abort", onCancel, { once: true });
      const pending = call.structuredSchema
        ? provider.generateStructured(request, call.structuredSchema, signal)
        : provider.generate(request, signal);
      pending.then(
        (response) => finish({ ok: true, response }),
        (error: unknown) => finish({ ok: false, category: error instanceof ProviderError ? error.category : "UNKNOWN" }),
      );
    });
  }
}
