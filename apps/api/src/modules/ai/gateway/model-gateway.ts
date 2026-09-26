import { Inject, Injectable } from "@nestjs/common";
import type { AiErrorCode, AiModelConfigStatus } from "@repo/contracts";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import { AI_DEFINITIONS, type AiDefinitions, type ModelProvider, type ModelRequest, type ModelResponse, type ModelUsage } from "../definitions/types";
import { AiFailure, PROVIDER_ERROR_CODES, ProviderError, type ProviderErrorCategory } from "./provider-errors";
import { backoffMs, isTransient } from "./retry-policy";

/** The parts of a model config the gateway needs; never a credential (006/FR-018). */
export interface GatewayModelConfig {
  key: string;
  provider: string;
  model: string;
  status: AiModelConfigStatus;
  parameters: Record<string, number | string | boolean>;
  /** Ceilings of the task's values (008 contracts/gateway-routing.md). */
  maxOutputTokens: number;
  timeoutMs: number;
}

/** Generation settings of the task (008 research G2). */
export interface GatewayTask {
  parameters: Record<string, number | string | boolean>;
  maxOutputTokens: number;
  timeoutMs: number;
}

/** The configs a call may use, fixed on the execution at request (008 research G5). */
export interface GatewayRoute {
  primary: GatewayModelConfig;
  fallback: GatewayModelConfig | null;
}

export interface GatewayCall {
  route: GatewayRoute;
  task: GatewayTask;
  /** Everything but the model fields, which come from the task and the config (006/FR-012). */
  request: Omit<ModelRequest, "model" | "parameters" | "maxOutputTokens">;
  limits: AiExecutionLimits;
  /** Total deadline of the execution; never retried past it (research A9). */
  deadline: Date;
  /** Aborted when the execution is cancelled. */
  signal: AbortSignal;
  /** JSON Schema of the agent's output, for providers that support structured output. */
  structuredSchema?: object;
}

/** What one config did within a logical call; the runner writes one `ai_model_calls` row per leg. */
export interface GatewayLeg {
  config: GatewayModelConfig;
  isFallback: boolean;
  startedAt: Date;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT";
  attempts: number;
  durationMs: number;
  errorCode: AiErrorCode | null;
  usage: ModelUsage | null;
  servedModel: string | null;
}

export interface GatewayResult {
  response: ModelResponse;
  legs: GatewayLeg[];
  attempts: number;
  durationMs: number;
}

type Outcome = { ok: true; response: ModelResponse } | { ok: false; reason: "cancelled" | "deadline" } | { ok: false; category: ProviderErrorCategory };

type LegResult = { ok: true; response: ModelResponse; leg: GatewayLeg } | { ok: false; leg: GatewayLeg & { errorCode: AiErrorCode } };

/**
 * The only way to a model (006 FR-001, FR-014, research A12): picks the provider of the config,
 * enforces the per-call timeout, the deadline and cancellation even if the provider ignores its
 * signal, retries only transient failures with growing waits, and normalizes every failure into
 * an `AiFailure`. Since 008 it runs a task's route and reports each config it used as a leg. It
 * never logs nor returns provider messages.
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

  /** Enabled, with its provider registered, and not refused by the routing policy (008 FR-008). */
  isUsable(config: GatewayModelConfig): boolean {
    return config.status === "ENABLED" && this.providerFor(config.provider) !== undefined && !this.refused(config.key);
  }

  private refused(configKey: string): boolean {
    return this.definitions.modelConfigs.some((config) => config.key === configKey && config.unavailableReason !== undefined);
  }

  async call(call: GatewayCall): Promise<GatewayResult> {
    const started = Date.now();
    const result = await this.leg(call.route.primary, false, call);
    if (!result.ok) throw new AiFailure(result.leg.errorCode, result.leg.attempts, Date.now() - started, [result.leg]);
    return { response: result.response, legs: [result.leg], attempts: result.leg.attempts, durationMs: Date.now() - started };
  }

  /** One config with its own retries, under the call's deadline and signal. */
  private async leg(config: GatewayModelConfig, isFallback: boolean, call: GatewayCall): Promise<LegResult> {
    const startedAt = new Date();
    const started = startedAt.getTime();
    const done = (errorCode: AiErrorCode, attempts: number): LegResult => ({
      ok: false,
      leg: {
        config,
        isFallback,
        startedAt,
        status: errorCode === "AI_TIMEOUT" ? "TIMED_OUT" : "FAILED",
        attempts,
        durationMs: Date.now() - started,
        errorCode,
        usage: null,
        servedModel: null,
      },
    });
    const provider = this.providerFor(config.provider);
    if (config.status !== "ENABLED" || !provider || this.refused(config.key)) return done("AI_MODEL_UNAVAILABLE", 0);

    const request: ModelRequest = {
      ...call.request,
      model: config.model,
      parameters: call.task.parameters,
      maxOutputTokens: Math.min(call.task.maxOutputTokens, config.maxOutputTokens),
    };
    const perCallMs = Math.min(call.task.timeoutMs, config.timeoutMs, call.limits.modelCallTimeoutMs);
    let attempts = 0;

    for (;;) {
      if (call.signal.aborted) return done("AI_EXECUTION_CANCELLED", attempts);
      const remaining = call.deadline.getTime() - Date.now();
      if (remaining <= 0) return done("AI_TIMEOUT", attempts);

      attempts += 1;
      const outcome = await this.attempt(provider, request, call, Math.min(perCallMs, remaining), remaining <= perCallMs);
      if (outcome.ok) {
        const response = outcome.response;
        return {
          ok: true,
          response,
          leg: {
            config,
            isFallback,
            startedAt,
            status: "SUCCEEDED",
            attempts,
            durationMs: Date.now() - started,
            errorCode: null,
            usage: response.usage,
            servedModel: response.servedModel ?? null,
          },
        };
      }
      if ("reason" in outcome) return done(outcome.reason === "cancelled" ? "AI_EXECUTION_CANCELLED" : "AI_TIMEOUT", attempts);
      if (!isTransient(outcome.category) || attempts > call.limits.maxRetries) return done(PROVIDER_ERROR_CODES[outcome.category], attempts);
      const wait = backoffMs(attempts - 1, this.timing.random);
      if (Date.now() + wait >= call.deadline.getTime()) return done(PROVIDER_ERROR_CODES[outcome.category], attempts);
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
