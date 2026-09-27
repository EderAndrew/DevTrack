import { describe, expect, it } from "vitest";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import type { AiDefinitions, DecisionRequest, DecisionResponse, ModelProvider, ModelRequest, ModelResponse } from "../definitions/types";
import { CircuitBreaker } from "./circuit-breaker";
import { type GatewayModelConfig, ModelGateway } from "./model-gateway";
import { AiFailure, ProviderError, type ProviderErrorCategory } from "./provider-errors";

const LIMITS: AiExecutionLimits = {
  totalTimeoutMs: 120_000,
  modelCallTimeoutMs: 60_000,
  toolTimeoutMs: 10_000,
  maxModelCalls: 5,
  maxToolCalls: 10,
  maxRetries: 2,
  maxInputBytes: 200 * 1024,
  maxOutputBytes: 200 * 1024,
};

const CONFIG: GatewayModelConfig = {
  key: "test-default",
  provider: "test",
  model: "m-1",
  status: "ENABLED",
  parameters: {},
  maxOutputTokens: 1000,
  timeoutMs: 5_000,
};

/** A route with only `config` as primary, and the config's own values as the task's (006 behavior). */
const routeOf = (config: GatewayModelConfig) => ({
  route: { primary: config, fallback: null },
  task: { parameters: config.parameters, maxOutputTokens: config.maxOutputTokens, timeoutMs: config.timeoutMs },
});

const REQUEST: Omit<ModelRequest, "model" | "parameters" | "maxOutputTokens"> = {
  system: "s",
  context: {},
  untrusted: [],
  tools: [],
  history: [],
};

type Step = { output: string } | { error: ProviderErrorCategory } | { hang: true } | { throw: Error };

/** In-memory provider following a script, one step per call (the last step repeats). */
function scriptedProvider(steps: Step[]) {
  const requests: ModelRequest[] = [];
  let call = 0;
  const run = (request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> => {
    requests.push(request);
    const step = steps[Math.min(call++, steps.length - 1)]!;
    if ("output" in step) return Promise.resolve({ kind: "output", text: step.output, usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 } });
    if ("error" in step) return Promise.reject(new ProviderError(step.error));
    if ("throw" in step) return Promise.reject(step.throw);
    return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
  };
  const provider: ModelProvider = {
    key: "test",
    generate: run,
    generateStructured: (request, _schema, signal) => run(request, signal),
    healthCheck: async () => "UP",
  };
  return { provider, requests, calls: () => call };
}

function gatewayWith(provider: ModelProvider | null, limits: Partial<AiExecutionLimits> = {}) {
  const definitions: AiDefinitions = { agents: [], tools: [], modelConfigs: [], tasks: [], families: [], providers: provider ? [provider] : [], resources: {} };
  const gateway = new ModelGateway(definitions);
  const sleeps: number[] = [];
  gateway.timing = { sleep: async (ms) => void sleeps.push(ms), random: () => 0 };
  return { gateway, sleeps, limits: { ...LIMITS, ...limits } };
}

const future = (ms = 60_000) => new Date(Date.now() + ms);

describe("006/FR-014 gateway de modelos", () => {
  it("chama o provedor da configuração, com modelo e parâmetros dela, e devolve uso e tentativas", async () => {
    const { provider, requests } = scriptedProvider([{ output: "{}" }]);
    const { gateway, limits } = gatewayWith(provider);
    const result = await gateway.call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: future(), signal: new AbortController().signal });
    expect(result.response).toMatchObject({ kind: "output", text: "{}", usage: { totalTokens: 7 } });
    expect(result.attempts).toBe(1);
    expect(requests[0]).toMatchObject({ model: "m-1", maxOutputTokens: 1000 });
  });

  it("configuração desabilitada ou provedor ausente → AI_MODEL_UNAVAILABLE sem chamar nada", async () => {
    const { provider, calls } = scriptedProvider([{ output: "{}" }]);
    const { gateway, limits } = gatewayWith(provider);
    await expect(
      gateway.call({ ...routeOf({ ...CONFIG, status: "DISABLED" }), request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_MODEL_UNAVAILABLE" });
    await expect(
      gateway.call({ ...routeOf({ ...CONFIG, provider: "outro" }), request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_MODEL_UNAVAILABLE" });
    expect(calls()).toBe(0);
  });

  it("006/FR-049 repete transitórios até o limite, com espera crescente, e registra as tentativas", async () => {
    const { provider } = scriptedProvider([{ error: "UNAVAILABLE" }, { error: "RATE_LIMITED" }, { output: "{}" }]);
    const { gateway, sleeps, limits } = gatewayWith(provider);
    const result = await gateway.call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: future(), signal: new AbortController().signal });
    expect(result.attempts).toBe(3);
    expect(sleeps).toEqual([500, 1000]);
  });

  it.each([
    ["UNAVAILABLE", "AI_PROVIDER_ERROR"],
    ["RATE_LIMITED", "AI_RATE_LIMITED"],
    ["TIMEOUT", "AI_TIMEOUT"],
  ] as const)("%s em todas as tentativas → %s com 3 tentativas", async (category, code) => {
    const { provider } = scriptedProvider([{ error: category }]);
    const { gateway, limits } = gatewayWith(provider);
    await expect(
      gateway.call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code, attempts: 3 });
  });

  it.each([
    ["INVALID_REQUEST", "AI_PROVIDER_ERROR"],
    ["AUTH", "AI_MODEL_UNAVAILABLE"],
    ["UNKNOWN", "AI_PROVIDER_ERROR"],
  ] as const)("falha permanente %s não é repetida → %s", async (category, code) => {
    const { provider, calls } = scriptedProvider([{ error: category }]);
    const { gateway, limits } = gatewayWith(provider);
    await expect(
      gateway.call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code, attempts: 1 });
    expect(calls()).toBe(1);
  });

  it("erro bruto do provedor vira AI_PROVIDER_ERROR sem a mensagem interna", async () => {
    const { provider } = scriptedProvider([{ throw: new Error("sk-secret leaked in message") }]);
    const { gateway, limits } = gatewayWith(provider);
    const failure = await gateway
      .call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: future(), signal: new AbortController().signal })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AiFailure);
    expect((failure as AiFailure).code).toBe("AI_PROVIDER_ERROR");
    expect(String((failure as AiFailure).message)).not.toContain("sk-secret");
  });

  it("chamada mais lenta que o tempo limite é interrompida e repetida; sem sucesso → AI_TIMEOUT", async () => {
    const { provider, calls } = scriptedProvider([{ hang: true }]);
    const { gateway, limits } = gatewayWith(provider, { modelCallTimeoutMs: 20 });
    await expect(
      gateway.call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_TIMEOUT", attempts: 3 });
    expect(calls()).toBe(3);
  });

  it("o prazo total corta a chamada e não é repetido", async () => {
    const { provider, calls } = scriptedProvider([{ hang: true }]);
    const { gateway, limits } = gatewayWith(provider);
    await expect(
      gateway.call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: future(30), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_TIMEOUT", attempts: 1 });
    expect(calls()).toBe(1);
    await expect(
      gateway.call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: new Date(Date.now() - 1), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_TIMEOUT", attempts: 0 });
  });

  it("006/FR-027 cancelamento interrompe a chamada → AI_EXECUTION_CANCELLED, sem nova tentativa", async () => {
    const { provider, calls } = scriptedProvider([{ hang: true }]);
    const { gateway, limits } = gatewayWith(provider);
    const controller = new AbortController();
    const pending = gateway.call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: future(), signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: "AI_EXECUTION_CANCELLED" });
    expect(calls()).toBe(1);
  });

  it("maxRetries 0 → uma tentativa só", async () => {
    const { provider, calls } = scriptedProvider([{ error: "UNAVAILABLE" }]);
    const { gateway, limits } = gatewayWith(provider, { maxRetries: 0 });
    await expect(
      gateway.call({ ...routeOf(CONFIG), request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ attempts: 1 });
    expect(calls()).toBe(1);
  });

  it("generateStructured recebe o JSON Schema quando informado", async () => {
    const seen: object[] = [];
    const provider: ModelProvider = {
      key: "test",
      generate: () => Promise.reject(new Error("não deveria")),
      generateStructured: (_r, schema) => {
        seen.push(schema);
        return Promise.resolve({ kind: "output", text: "{}", usage: null });
      },
      healthCheck: async () => "UP",
    };
    const { gateway, limits } = gatewayWith(provider);
    await gateway.call({
      ...routeOf(CONFIG),
      request: REQUEST,
      limits,
      deadline: future(),
      signal: new AbortController().signal,
      structuredSchema: { type: "object" },
    });
    expect(seen).toEqual([{ type: "object" }]);
  });
});

describe("008/FR-006 rota da tarefa e pernas da chamada", () => {
  const TASK = { parameters: { temperature: 0.2 }, maxOutputTokens: 500, timeoutMs: 4_000 };

  it("rota sem fallback: uma perna com tentativas, duração, uso e o modelo servido", async () => {
    const provider: ModelProvider = {
      key: "test",
      generate: async () => ({ kind: "output", text: "{}", usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 }, servedModel: "m-1-2026" }),
      generateStructured: async () => ({ kind: "output", text: "{}", usage: null }),
      healthCheck: async () => "UP",
    };
    const { gateway, limits } = gatewayWith(provider);
    const result = await gateway.call({ route: { primary: CONFIG, fallback: null }, task: TASK, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal });
    expect(result.legs).toEqual([
      {
        config: CONFIG,
        isFallback: false,
        startedAt: expect.any(Date),
        status: "SUCCEEDED",
        attempts: 1,
        durationMs: expect.any(Number),
        errorCode: null,
        usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
        servedModel: "m-1-2026",
      },
    ]);
  });

  it("sem modelo servido informado, a perna fica com null", async () => {
    const { provider } = scriptedProvider([{ output: "{}" }]);
    const { gateway, limits } = gatewayWith(provider);
    const result = await gateway.call({ route: { primary: CONFIG, fallback: null }, task: TASK, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal });
    expect(result.legs[0]!.servedModel).toBeNull();
  });

  it("valores efetivos: min(tarefa, configuração, limite) para tokens e tempo, e os parâmetros da tarefa", async () => {
    const { provider, requests } = scriptedProvider([{ hang: true }]);
    const { gateway, limits } = gatewayWith(provider, { maxRetries: 0, modelCallTimeoutMs: 60_000 });
    const started = Date.now();
    await expect(
      gateway.call({
        route: { primary: { ...CONFIG, maxOutputTokens: 800, timeoutMs: 5_000 }, fallback: null },
        task: { parameters: { temperature: 0.2 }, maxOutputTokens: 500, timeoutMs: 30 },
        request: REQUEST,
        limits,
        deadline: future(),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "AI_TIMEOUT" });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(requests[0]).toMatchObject({ maxOutputTokens: 500, parameters: { temperature: 0.2 } });

    const second = scriptedProvider([{ output: "{}" }]);
    const other = gatewayWith(second.provider);
    await other.gateway.call({
      route: { primary: { ...CONFIG, maxOutputTokens: 300 }, fallback: null },
      task: TASK,
      request: REQUEST,
      limits: other.limits,
      deadline: future(),
      signal: new AbortController().signal,
    });
    expect(second.requests[0]).toMatchObject({ maxOutputTokens: 300 });
  });

  it("na falha, o AiFailure leva a perna do principal com o código e as tentativas", async () => {
    const { provider } = scriptedProvider([{ error: "INVALID_REQUEST" }]);
    const { gateway, limits } = gatewayWith(provider);
    const failure = (await gateway
      .call({ route: { primary: CONFIG, fallback: null }, task: TASK, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal })
      .catch((error: unknown) => error)) as AiFailure;
    expect(failure.legs).toEqual([
      expect.objectContaining({ config: CONFIG, isFallback: false, status: "FAILED", attempts: 1, errorCode: "AI_PROVIDER_ERROR", usage: null, servedModel: null }),
    ]);
  });

  it("na falha por tempo, a perna fica TIMED_OUT", async () => {
    const { provider } = scriptedProvider([{ error: "TIMEOUT" }]);
    const { gateway, limits } = gatewayWith(provider, { maxRetries: 0 });
    const failure = (await gateway
      .call({ route: { primary: CONFIG, fallback: null }, task: TASK, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal })
      .catch((error: unknown) => error)) as AiFailure;
    expect(failure.legs).toEqual([expect.objectContaining({ status: "TIMED_OUT", errorCode: "AI_TIMEOUT" })]);
  });
});

describe("008/FR-010 008/FR-011 008/SC-003 fallback depois do principal (contracts/gateway-routing.md)", () => {
  const PRIMARY: GatewayModelConfig = { ...CONFIG, key: "primary", model: "m-primary" };
  const FALLBACK: GatewayModelConfig = { ...CONFIG, key: "fallback", model: "m-fallback" };
  const task = { parameters: {}, maxOutputTokens: 1000, timeoutMs: 5_000 };

  /** One script per model (the last step of each repeats); `order` keeps the models called. */
  function byModel(scripts: Record<string, Step[]>) {
    const order: string[] = [];
    const counters = new Map<string, number>();
    const run = (request: ModelRequest, signal: AbortSignal): Promise<ModelResponse> => {
      order.push(request.model);
      const steps = scripts[request.model]!;
      const n = counters.get(request.model) ?? 0;
      counters.set(request.model, n + 1);
      const step = steps[Math.min(n, steps.length - 1)]!;
      if ("output" in step) return Promise.resolve({ kind: "output", text: step.output, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } });
      if ("error" in step) return Promise.reject(new ProviderError(step.error));
      if ("throw" in step) return Promise.reject(step.throw);
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    };
    const provider: ModelProvider = { key: "test", generate: run, generateStructured: (r, _s, signal) => run(r, signal), healthCheck: async () => "UP" };
    return { provider, order };
  }

  const call = (gateway: ModelGateway, limits: AiExecutionLimits, extra: { primary?: GatewayModelConfig; fallback?: GatewayModelConfig | null; deadline?: Date; signal?: AbortSignal } = {}) =>
    gateway.call({
      route: { primary: extra.primary ?? PRIMARY, fallback: extra.fallback === undefined ? FALLBACK : extra.fallback },
      task,
      request: REQUEST,
      limits,
      deadline: extra.deadline ?? future(),
      signal: extra.signal ?? new AbortController().signal,
    });

  it.each([
    ["UNAVAILABLE", "AI_PROVIDER_ERROR"],
    ["RATE_LIMITED", "AI_RATE_LIMITED"],
    ["TIMEOUT", "AI_TIMEOUT"],
  ] as const)("%s do principal esgota as tentativas e chama o fallback uma vez, com as suas tentativas", async (category, code) => {
    const { provider, order } = byModel({ "m-primary": [{ error: category }], "m-fallback": [{ error: "UNAVAILABLE" }, { output: "{}" }] });
    const { gateway, limits } = gatewayWith(provider);
    const result = await call(gateway, limits);

    expect(result.response).toMatchObject({ kind: "output", text: "{}" });
    expect(order).toEqual(["m-primary", "m-primary", "m-primary", "m-fallback", "m-fallback"]);
    expect(result.legs).toHaveLength(2);
    expect(result.legs[0]).toMatchObject({ config: { key: "primary" }, isFallback: false, status: category === "TIMEOUT" ? "TIMED_OUT" : "FAILED", attempts: 3, errorCode: code });
    expect(result.legs[1]).toMatchObject({
      config: { key: "fallback" },
      isFallback: true,
      status: "SUCCEEDED",
      attempts: 2,
      trigger: { reason: "PROVIDER_FAILURE", primaryErrorCode: code },
    });
    expect(result.attempts).toBe(5);
  });

  it.each(["INVALID_REQUEST", "AUTH", "UNKNOWN"] as const)("%s do principal → sem fallback", async (category) => {
    const { provider, order } = byModel({ "m-primary": [{ error: category }], "m-fallback": [{ output: "{}" }] });
    const { gateway, limits } = gatewayWith(provider);
    const error = (await call(gateway, limits).catch((e: unknown) => e)) as AiFailure;
    expect(error).toBeInstanceOf(AiFailure);
    expect(order).toEqual(["m-primary"]);
    expect(error.legs.map((leg) => leg.isFallback)).toEqual([false]);
  });

  it("um erro fora de ProviderError no principal → UNKNOWN, sem fallback", async () => {
    const { provider, order } = byModel({ "m-primary": [{ throw: new Error("x") }], "m-fallback": [{ output: "{}" }] });
    const { gateway, limits } = gatewayWith(provider);
    await expect(call(gateway, limits)).rejects.toBeInstanceOf(AiFailure);
    expect(order).toEqual(["m-primary"]);
  });

  it("cancelamento durante o principal → AI_EXECUTION_CANCELLED, sem fallback", async () => {
    const { provider, order } = byModel({ "m-primary": [{ hang: true }], "m-fallback": [{ output: "{}" }] });
    const { gateway, limits } = gatewayWith(provider);
    const controller = new AbortController();
    const pending = call(gateway, limits, { signal: controller.signal }).catch((e: unknown) => e);
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();
    expect(await pending).toMatchObject({ code: "AI_EXECUTION_CANCELLED" });
    expect(order).toEqual(["m-primary"]);
  });

  it("prazo da execução esgotado no principal → AI_TIMEOUT, sem fallback", async () => {
    const { provider, order } = byModel({ "m-primary": [{ hang: true }], "m-fallback": [{ output: "{}" }] });
    const { gateway, limits } = gatewayWith(provider);
    const error = (await call(gateway, limits, { deadline: future(50) }).catch((e: unknown) => e)) as AiFailure;
    expect(error.code).toBe("AI_TIMEOUT");
    expect(order).toEqual(["m-primary"]);
    expect(error.legs).toHaveLength(1);
  });

  it("o fallback roda só no prazo que resta da execução, nunca além", async () => {
    const { provider, order } = byModel({ "m-primary": [{ error: "UNAVAILABLE" }], "m-fallback": [{ hang: true }] });
    const { gateway, limits } = gatewayWith(provider, { maxRetries: 0 });
    const started = Date.now();
    const error = (await call(gateway, limits, { deadline: future(100) }).catch((e: unknown) => e)) as AiFailure;
    expect(error.code).toBe("AI_TIMEOUT");
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(order).toEqual(["m-primary", "m-fallback"]);
    expect(error.legs.map((leg) => [leg.isFallback, leg.status])).toEqual([
      [false, "FAILED"],
      [true, "TIMED_OUT"],
    ]);
  });

  it("principal e fallback falhando → AiFailure com o código do fallback e duas pernas, sem voltar ao principal", async () => {
    const { provider, order } = byModel({ "m-primary": [{ error: "UNAVAILABLE" }], "m-fallback": [{ error: "RATE_LIMITED" }] });
    const { gateway, limits } = gatewayWith(provider);
    const error = (await call(gateway, limits).catch((e: unknown) => e)) as AiFailure;
    expect(error.code).toBe("AI_RATE_LIMITED");
    expect(error.legs.map((leg) => [leg.config.key, leg.isFallback])).toEqual([
      ["primary", false],
      ["fallback", true],
    ]);
    expect(order).toEqual(["m-primary", "m-primary", "m-primary", "m-fallback", "m-fallback", "m-fallback"]);
    expect(error.attempts).toBe(6); // (1 + maxRetries) per leg, never more
  });

  it("fallback desabilitado → o código do principal, sem chamada ao fallback", async () => {
    const { provider, order } = byModel({ "m-primary": [{ error: "UNAVAILABLE" }], "m-fallback": [{ output: "{}" }] });
    const { gateway, limits } = gatewayWith(provider);
    const error = (await call(gateway, limits, { fallback: { ...FALLBACK, status: "DISABLED" } }).catch((e: unknown) => e)) as AiFailure;
    expect(error.code).toBe("AI_PROVIDER_ERROR");
    expect(order.every((model) => model === "m-primary")).toBe(true);
    expect(error.legs).toHaveLength(1);
  });

  it("principal desabilitado pelo administrador → direto no fallback, sem perna do principal", async () => {
    const { provider, order } = byModel({ "m-primary": [{ output: "{}" }], "m-fallback": [{ output: "{}" }] });
    const { gateway, limits } = gatewayWith(provider);
    const result = await call(gateway, limits, { primary: { ...PRIMARY, status: "DISABLED" } });
    expect(order).toEqual(["m-fallback"]);
    expect(result.legs).toEqual([
      expect.objectContaining({ isFallback: true, status: "SUCCEEDED", trigger: { reason: "PROVIDER_FAILURE", primaryErrorCode: "AI_MODEL_UNAVAILABLE" } }),
    ]);
  });

  it("rota sem fallback → comportamento da 006: uma perna e o código do principal", async () => {
    const { provider, order } = byModel({ "m-primary": [{ error: "UNAVAILABLE" }] });
    const { gateway, limits } = gatewayWith(provider);
    const error = (await call(gateway, limits, { fallback: null }).catch((e: unknown) => e)) as AiFailure;
    expect(error.code).toBe("AI_PROVIDER_ERROR");
    expect(error.legs).toHaveLength(1);
    expect(order).toHaveLength(3);
  });
});

describe("009/FR-001b decisão pelo gateway (contracts/decisions-provider.md)", () => {
  const PRIMARY: GatewayModelConfig = { ...CONFIG, key: "decision-primary", model: "typesafe/jev-1.13" };
  const FALLBACK: GatewayModelConfig = { ...CONFIG, key: "decision-fallback", model: "typesafe/jev-alt" };
  const QUESTIONS: DecisionRequest["questions"] = {
    kind: { type: "choice", instructions: "Which kind?", criteria: { bug: "A defect", feature: "A new capability" } },
    urgency: { type: "score", instructions: "How urgent?", criteria: ["low", "medium", "high"] },
    reply: { type: "noul", instructions: "Needs a reply?", criteria: { true: "yes", false: "no" } },
  };
  const VALID: DecisionResponse["answers"] = {
    kind: { type: "choice", choice: "bug", probabilities: { bug: 0.9, feature: 0.1 }, confidence: 0.9 },
    urgency: { type: "score", score: 1.4, probabilities: { low: 0.1, medium: 0.5, high: 0.4 }, confidence: 0.8 },
    reply: { type: "noul", noul: 0.92 },
  };

  type DecisionStep = { answers: DecisionResponse["answers"] } | { error: ProviderErrorCategory };

  /** A decision provider with one script per model (the last step of each repeats). */
  function decider(scripts: Record<string, DecisionStep[]>) {
    const requests: DecisionRequest[] = [];
    const counters = new Map<string, number>();
    const provider: ModelProvider = {
      key: "test",
      generate: () => Promise.reject(new Error("generate não é usado")),
      generateStructured: () => Promise.reject(new Error("generate não é usado")),
      healthCheck: async () => "UP",
      decide: (request) => {
        requests.push(request);
        const steps = scripts[request.model]!;
        const n = counters.get(request.model) ?? 0;
        counters.set(request.model, n + 1);
        const step = steps[Math.min(n, steps.length - 1)]!;
        if ("error" in step) return Promise.reject(new ProviderError(step.error));
        return Promise.resolve({ answers: step.answers, usage: { inputTokens: 600, outputTokens: 3, totalTokens: 603, cost: { amount: "0.00003", currency: "USD" } }, servedModel: `${request.model}-20260917` });
      },
    };
    return { provider, requests };
  }

  const decide = (gateway: ModelGateway, limits: AiExecutionLimits, extra: { fallback?: GatewayModelConfig | null; minConfidence?: number } = {}) =>
    gateway.decide({
      route: { primary: PRIMARY, fallback: extra.fallback === undefined ? null : extra.fallback },
      task: { timeoutMs: 5_000, minConfidence: extra.minConfidence ?? 0.7 },
      request: { state: "Texto não confiável", questions: QUESTIONS },
      limits,
      deadline: future(),
      signal: new AbortController().signal,
    });

  it("009/US1-4 envia o modelo da configuração, o estado e as perguntas; respostas válidas voltam como estão, com a perna", async () => {
    const { provider, requests } = decider({ [PRIMARY.model]: [{ answers: VALID }] });
    const { gateway, limits } = gatewayWith(provider);
    const result = await decide(gateway, limits);

    expect(requests).toEqual([{ model: PRIMARY.model, state: "Texto não confiável", questions: QUESTIONS }]);
    expect(result.answers).toEqual(VALID);
    expect(result.legs).toEqual([
      expect.objectContaining({ config: PRIMARY, isFallback: false, status: "SUCCEEDED", attempts: 1, servedModel: `${PRIMARY.model}-20260917`, usage: expect.objectContaining({ cost: { amount: "0.00003", currency: "USD" } }) }),
    ]);
  });

  it("abaixo de minConfidence a resposta vira UNDECIDED; o noul usa a faixa de incerteza", async () => {
    const answers: DecisionResponse["answers"] = {
      kind: { type: "choice", choice: "bug", probabilities: { bug: 0.55, feature: 0.45 }, confidence: 0.55 },
      urgency: { type: "score", score: 2, probabilities: { low: 0, medium: 0.1, high: 0.9 }, confidence: 0.9 },
      reply: { type: "noul", noul: 0.4 },
    };
    const { provider } = decider({ [PRIMARY.model]: [{ answers }] });
    const { gateway, limits } = gatewayWith(provider);
    const result = await decide(gateway, limits, { minConfidence: 0.7 });

    expect(result.answers).toEqual({ kind: { type: "choice", undecided: true }, urgency: answers.urgency, reply: { type: "noul", undecided: true } });
    // noul 0.25 → 75% "não", acima de 0.7: decidido.
    const confident = decider({ [PRIMARY.model]: [{ answers: { ...VALID, reply: { type: "noul", noul: 0.25 } } }] });
    expect((await decide(gatewayWith(confident.provider).gateway, limits)).answers.reply).toEqual({ type: "noul", noul: 0.25 });
  });

  it.each<[string, DecisionResponse["answers"]]>([
    ["pergunta sem resposta", { kind: VALID.kind!, urgency: VALID.urgency! }],
    ["resposta a pergunta não feita", { ...VALID, extra: { type: "noul", noul: 1 } }],
    ["tipo diferente do perguntado", { ...VALID, kind: { type: "noul", noul: 1 } }],
    ["escolha fora das opções", { ...VALID, kind: { type: "choice", choice: "question", probabilities: { bug: 0.5, feature: 0.5 }, confidence: 0.9 } }],
    ["nota fora de [0, níveis − 1]", { ...VALID, urgency: { type: "score", score: 3, probabilities: { low: 0, medium: 0, high: 1 }, confidence: 0.9 } }],
    ["probabilidade fora de [0, 1]", { ...VALID, kind: { type: "choice", choice: "bug", probabilities: { bug: 1.2, feature: 0 }, confidence: 0.9 } }],
    ["confiança fora de [0, 1]", { ...VALID, kind: { type: "choice", choice: "bug", probabilities: { bug: 1, feature: 0 }, confidence: 2 } }],
    ["noul fora de [0, 1]", { ...VALID, reply: { type: "noul", noul: -0.1 } }],
  ])("resposta fora do pedido (%s) → AI_OUTPUT_VALIDATION_FAILED, sem fallback, com a perna", async (_name, answers) => {
    const { provider, requests } = decider({ [PRIMARY.model]: [{ answers }], [FALLBACK.model]: [{ answers: VALID }] });
    const { gateway, limits } = gatewayWith(provider);
    const failure = await decide(gateway, limits, { fallback: FALLBACK }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AiFailure);
    expect(failure).toMatchObject({ code: "AI_OUTPUT_VALIDATION_FAILED", legs: [expect.objectContaining({ config: PRIMARY, status: "SUCCEEDED" })] });
    expect(requests).toHaveLength(1);
  });

  it("falha transitória do principal → fallback uma vez, como em call", async () => {
    const { provider, requests } = decider({ [PRIMARY.model]: [{ error: "UNAVAILABLE" }], [FALLBACK.model]: [{ answers: VALID }] });
    const { gateway, limits } = gatewayWith(provider);
    const result = await decide(gateway, limits, { fallback: FALLBACK });

    expect(requests.map((request) => request.model)).toEqual([PRIMARY.model, PRIMARY.model, PRIMARY.model, FALLBACK.model]);
    expect(result.legs.map((leg) => [leg.config.key, leg.status, leg.trigger?.reason])).toEqual([
      [PRIMARY.key, "FAILED", undefined],
      [FALLBACK.key, "SUCCEEDED", "PROVIDER_FAILURE"],
    ]);
  });

  it("circuito aberto no principal → direto no fallback, sem chamar o principal", async () => {
    const { provider, requests } = decider({ [PRIMARY.model]: [{ error: "UNAVAILABLE" }], [FALLBACK.model]: [{ answers: VALID }] });
    const definitions: AiDefinitions = { agents: [], tools: [], modelConfigs: [], tasks: [], families: [], providers: [provider], resources: {} };
    const gateway = new ModelGateway(definitions, new CircuitBreaker({ failureThreshold: 1, openSeconds: 60 }));
    gateway.timing = { sleep: async () => undefined, random: () => 0 };
    await decide(gateway, LIMITS, { fallback: FALLBACK });
    requests.length = 0;

    const result = await decide(gateway, LIMITS, { fallback: FALLBACK });
    expect(requests.map((request) => request.model)).toEqual([FALLBACK.model]);
    expect(result.legs).toEqual([expect.objectContaining({ config: FALLBACK, trigger: { reason: "CIRCUIT_OPEN", primaryErrorCode: null } })]);
  });

  it("009/FR-001a provedor sem modo decisão → AI_MODEL_UNAVAILABLE, sem chamada", async () => {
    const { provider, calls } = scriptedProvider([{ output: "{}" }]);
    const { gateway, limits } = gatewayWith(provider);
    await expect(decide(gateway, limits)).rejects.toMatchObject({ code: "AI_MODEL_UNAVAILABLE" });
    expect(calls()).toBe(0);
  });
});
