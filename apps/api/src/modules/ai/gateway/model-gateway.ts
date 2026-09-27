import { Inject, Injectable, Optional } from "@nestjs/common";
import type { AiErrorCode, AiModelConfigStatus } from "@repo/contracts";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import {
  AI_DEFINITIONS,
  type AiDefinitions,
  type DecisionAnswer,
  type DecisionQuestion,
  type DecisionRequest,
  type DecisionResponse,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelUsage,
} from "../definitions/types";
import { CircuitBreaker } from "./circuit-breaker";
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

/** Why a logical call went to the fallback (008 contracts/audit-events.md). */
export interface FallbackTrigger {
  reason: "PROVIDER_FAILURE" | "CIRCUIT_OPEN";
  /** The primary leg's final code; `AI_MODEL_UNAVAILABLE` when the primary couldn't be called. */
  primaryErrorCode: AiErrorCode | null;
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
  /** Only on a fallback leg. */
  trigger?: FallbackTrigger;
}

export interface GatewayResult {
  response: ModelResponse;
  legs: GatewayLeg[];
  attempts: number;
  durationMs: number;
}

/** A call to a decision model (009 research H10, contracts/decisions-provider.md). */
export interface GatewayDecisionCall {
  route: GatewayRoute;
  /** The task's timeout and the confidence below which an answer is `UNDECIDED` (009 FR-001b). */
  task: { timeoutMs: number; minConfidence: number };
  request: Omit<DecisionRequest, "model">;
  limits: AiExecutionLimits;
  deadline: Date;
  signal: AbortSignal;
}

/** An answer the model gave without the task's certainty: the caller decides otherwise. */
export interface UndecidedAnswer {
  type: DecisionQuestion["type"];
  undecided: true;
}

export interface GatewayDecisionResult {
  answers: Record<string, DecisionAnswer | UndecidedAnswer>;
  legs: GatewayLeg[];
  attempts: number;
  durationMs: number;
}

/** What every provider answer carries for the leg's record. */
type ProviderAnswer = { usage: ModelUsage | null; servedModel?: string | null };

/** How one kind of call reaches a provider: whether it can, and the request for a config. */
interface Sender<R extends ProviderAnswer> {
  supports(provider: ModelProvider): boolean;
  send(provider: ModelProvider, config: GatewayModelConfig, signal: AbortSignal): Promise<R>;
}

/** The bounds every leg of a logical call shares. */
interface CallBounds {
  taskTimeoutMs: number;
  limits: AiExecutionLimits;
  deadline: Date;
  signal: AbortSignal;
}

type Outcome<R> = { ok: true; response: R } | { ok: false; reason: "cancelled" | "deadline" } | { ok: false; category: ProviderErrorCategory };

/** `recoverable`: the leg ended on a transient provider failure, so the fallback may run (008 FR-010). */
type LegResult<R> = { ok: true; response: R; leg: GatewayLeg } | { ok: false; recoverable: boolean; leg: GatewayLeg & { errorCode: AiErrorCode } };

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

  /** Without a circuit (unit tests of 006), one that never opens. */
  private readonly circuit: CircuitBreaker;

  constructor(
    @Inject(AI_DEFINITIONS) private readonly definitions: AiDefinitions,
    @Optional() circuit?: CircuitBreaker,
  ) {
    this.circuit = circuit ?? new CircuitBreaker({ failureThreshold: Number.POSITIVE_INFINITY, openSeconds: 0 });
  }

  providerFor(key: string): ModelProvider | undefined {
    return this.definitions.providers.find((provider) => provider.key === key);
  }

  /**
   * Can take a call now: enabled, with its provider registered and not behind an open circuit
   * (008 FR-013). Which models a task may use is the policy's (009), checked at request.
   */
  isUsable(config: GatewayModelConfig): boolean {
    return this.callable(config) && !this.circuit.blocks(config.key);
  }

  /** Everything `isUsable` checks but the circuit, which the gateway asks leg by leg. */
  private callable(config: GatewayModelConfig): boolean {
    return config.status === "ENABLED" && this.providerFor(config.provider) !== undefined;
  }

  /**
   * One logical call (008 research G6, G8, contracts/gateway-routing.md): the primary with its
   * retries; after a transient failure, when the primary can't be called or when its circuit is
   * open, the fallback once, with its own retries, under the same deadline and signal. Never back
   * to the primary, so at most two legs. Each leg's final outcome goes to its circuit.
   */
  async call(call: GatewayCall): Promise<GatewayResult> {
    const { response, legs, started } = await this.route(call.route, { ...call, taskTimeoutMs: call.task.timeoutMs }, {
      supports: () => true,
      send: (provider, config, signal) => {
        const request: ModelRequest = {
          ...call.request,
          model: config.model,
          parameters: call.task.parameters,
          maxOutputTokens: Math.min(call.task.maxOutputTokens, config.maxOutputTokens),
        };
        return call.structuredSchema ? provider.generateStructured(request, call.structuredSchema, signal) : provider.generate(request, signal);
      },
    });
    return { response, legs, attempts: attemptsOf(legs), durationMs: Date.now() - started };
  }

  /**
   * A call to a decision model (009 FR-001a, FR-001b, research H10): the same legs, retries,
   * fallback and circuit as `call`, on providers with a decision mode. The answers must match the
   * questions asked (ids, types, options, ranges), or the call fails `AI_OUTPUT_VALIDATION_FAILED`
   * without a fallback; an answer below the task's `minConfidence` comes back `UNDECIDED`.
   */
  async decide(call: GatewayDecisionCall): Promise<GatewayDecisionResult> {
    const { response, legs, started } = await this.route(call.route, { ...call, taskTimeoutMs: call.task.timeoutMs }, {
      supports: (provider) => typeof provider.decide === "function",
      send: (provider, config, signal) => provider.decide!({ ...call.request, model: config.model }, signal),
    });
    const attempts = attemptsOf(legs);
    if (!answersMatch(response, call.request.questions)) {
      throw new AiFailure("AI_OUTPUT_VALIDATION_FAILED", attempts, Date.now() - started, legs);
    }
    const answers = Object.fromEntries(
      Object.entries(response.answers).map(([id, answer]) => [id, confidenceOf(answer) < call.task.minConfidence ? { type: answer.type, undecided: true as const } : answer]),
    );
    return { answers, legs, attempts, durationMs: Date.now() - started };
  }

  /** The legs of one logical call (see `call`); throws `AiFailure` with the legs when none succeeds. */
  private async route<R extends ProviderAnswer>(
    route: GatewayRoute,
    bounds: CallBounds,
    sender: Sender<R>,
  ): Promise<{ response: R; legs: GatewayLeg[]; started: number }> {
    const started = Date.now();
    const { primary, fallback } = route;
    const legs: GatewayLeg[] = [];
    const finish = (response: R) => ({ response, legs, started });
    const fail = (code: AiErrorCode): never => {
      throw new AiFailure(code, attemptsOf(legs), Date.now() - started, legs);
    };
    const callable = (config: GatewayModelConfig) => this.callable(config) && sender.supports(this.providerFor(config.provider)!);

    let trigger: FallbackTrigger;
    const primaryCallable = callable(primary);
    const decision = primaryCallable ? this.circuit.allow(primary.key) : null;
    if (decision === "CALL" || decision === "PROBE" || !fallback) {
      if (decision === "OPEN") return fail("AI_MODEL_UNAVAILABLE"); // open circuit, nowhere else to go
      const first = await this.leg(primary, false, bounds, primaryCallable, sender);
      legs.push(first.leg);
      if (primaryCallable) await this.report(primary, first);
      if (first.ok) return finish(first.response);
      if (!fallback || !first.recoverable) return fail(first.leg.errorCode);
      trigger = { reason: "PROVIDER_FAILURE", primaryErrorCode: first.leg.errorCode };
    } else if (decision === "OPEN") {
      // The model isn't called while its circuit is open: straight to the fallback.
      trigger = { reason: "CIRCUIT_OPEN", primaryErrorCode: null };
    } else {
      // Disabled by the admin or without its provider: nothing to call on the primary.
      trigger = { reason: "PROVIDER_FAILURE", primaryErrorCode: "AI_MODEL_UNAVAILABLE" };
    }

    const primaryCode = trigger.primaryErrorCode ?? "AI_MODEL_UNAVAILABLE";
    if (!callable(fallback)) return fail(primaryCode);
    if (bounds.signal.aborted) return fail("AI_EXECUTION_CANCELLED");
    if (bounds.deadline.getTime() <= Date.now()) return fail(primaryCode);
    if (this.circuit.allow(fallback.key) === "OPEN") return fail(primaryCode);
    const second = await this.leg(fallback, true, bounds, true, sender);
    legs.push({ ...second.leg, trigger });
    await this.report(fallback, second);
    if (second.ok) return finish(second.response);
    return fail(second.leg.errorCode);
  }

  /** The leg's final outcome, not each attempt, goes to the config's circuit (research G8). */
  private async report<R>(config: GatewayModelConfig, result: LegResult<R>): Promise<void> {
    if (result.ok) await this.circuit.recordSuccess(config);
    else if (result.recoverable) await this.circuit.recordTransientFailure(config);
    else this.circuit.recordOtherOutcome(config);
  }

  /** One config with its own retries, under the call's deadline and signal. */
  private async leg<R extends ProviderAnswer>(
    config: GatewayModelConfig,
    isFallback: boolean,
    bounds: CallBounds,
    callable: boolean,
    sender: Sender<R>,
  ): Promise<LegResult<R>> {
    const startedAt = new Date();
    const started = startedAt.getTime();
    const done = (errorCode: AiErrorCode, attempts: number, recoverable = false): LegResult<R> => ({
      ok: false,
      recoverable,
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
    if (!callable || !provider) return done("AI_MODEL_UNAVAILABLE", 0);

    const perCallMs = Math.min(bounds.taskTimeoutMs, config.timeoutMs, bounds.limits.modelCallTimeoutMs);
    let attempts = 0;

    for (;;) {
      if (bounds.signal.aborted) return done("AI_EXECUTION_CANCELLED", attempts);
      const remaining = bounds.deadline.getTime() - Date.now();
      if (remaining <= 0) return done("AI_TIMEOUT", attempts);

      attempts += 1;
      const outcome = await this.attempt((signal) => sender.send(provider, config, signal), bounds.signal, Math.min(perCallMs, remaining), remaining <= perCallMs);
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
      const code = PROVIDER_ERROR_CODES[outcome.category];
      if (!isTransient(outcome.category)) return done(code, attempts);
      if (attempts > bounds.limits.maxRetries) return done(code, attempts, true);
      const wait = backoffMs(attempts - 1, this.timing.random);
      if (Date.now() + wait >= bounds.deadline.getTime()) return done(code, attempts, true);
      await this.timing.sleep(wait);
    }
  }

  /** One provider call bounded by `timeoutMs`; `deadlineBound` says the timeout is the deadline itself. */
  private attempt<R>(send: (signal: AbortSignal) => Promise<R>, cancel: AbortSignal, timeoutMs: number, deadlineBound: boolean): Promise<Outcome<R>> {
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, cancel]);
    return new Promise<Outcome<R>>((resolve) => {
      const onCancel = () => finish({ ok: false, reason: "cancelled" });
      const timer = setTimeout(() => finish(deadlineBound ? { ok: false, reason: "deadline" } : { ok: false, category: "TIMEOUT" }), timeoutMs);
      let done = false;
      function finish(outcome: Outcome<R>) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cancel.removeEventListener("abort", onCancel);
        controller.abort();
        resolve(outcome);
      }
      cancel.addEventListener("abort", onCancel, { once: true });
      send(signal).then(
        (response) => finish({ ok: true, response }),
        (error: unknown) => finish({ ok: false, category: error instanceof ProviderError ? error.category : "UNKNOWN" }),
      );
    });
  }
}

const attemptsOf = (legs: readonly GatewayLeg[]) => legs.reduce((sum, leg) => sum + leg.attempts, 0);

const isProbability = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

const probabilitiesValid = (probabilities: unknown) =>
  probabilities !== null && typeof probabilities === "object" && Object.values(probabilities).every(isProbability);

/** Every asked id answered with the asked type, a value among the asked options or levels, probabilities in [0, 1]. */
function answersMatch(response: DecisionResponse, questions: Record<string, DecisionQuestion>): boolean {
  const answers = response.answers;
  if (!answers || typeof answers !== "object") return false;
  const ids = Object.keys(answers);
  if (ids.length !== Object.keys(questions).length || !ids.every((id) => Object.hasOwn(questions, id))) return false;
  return ids.every((id) => {
    const question = questions[id]!;
    const answer = answers[id];
    if (!answer || answer.type !== question.type) return false;
    if (answer.type === "noul") return isProbability(answer.noul);
    if (!isProbability(answer.confidence) || !probabilitiesValid(answer.probabilities)) return false;
    if (answer.type === "choice") return typeof answer.choice === "string" && Object.hasOwn(question.criteria, answer.choice);
    const levels = (question.criteria as string[]).length;
    return typeof answer.score === "number" && Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= levels - 1;
  });
}

/** How sure the model is: its confidence, or for a yes/no the probability of the likelier side. */
const confidenceOf = (answer: DecisionAnswer): number => (answer.type === "noul" ? Math.max(answer.noul, 1 - answer.noul) : answer.confidence);
