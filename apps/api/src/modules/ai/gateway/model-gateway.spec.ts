import { describe, expect, it } from "vitest";
import type { AiExecutionLimits } from "../../../platform/config/config.schema";
import type { AiDefinitions, ModelProvider, ModelRequest, ModelResponse } from "../definitions/types";
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
  const definitions: AiDefinitions = { agents: [], tools: [], modelConfigs: [], providers: provider ? [provider] : [], resources: {} };
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
    const result = await gateway.call({ config: CONFIG, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal });
    expect(result.response).toMatchObject({ kind: "output", text: "{}", usage: { totalTokens: 7 } });
    expect(result.attempts).toBe(1);
    expect(requests[0]).toMatchObject({ model: "m-1", maxOutputTokens: 1000 });
  });

  it("configuração desabilitada ou provedor ausente → AI_MODEL_UNAVAILABLE sem chamar nada", async () => {
    const { provider, calls } = scriptedProvider([{ output: "{}" }]);
    const { gateway, limits } = gatewayWith(provider);
    await expect(
      gateway.call({ config: { ...CONFIG, status: "DISABLED" }, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_MODEL_UNAVAILABLE" });
    await expect(
      gateway.call({ config: { ...CONFIG, provider: "outro" }, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_MODEL_UNAVAILABLE" });
    expect(calls()).toBe(0);
  });

  it("006/FR-049 repete transitórios até o limite, com espera crescente, e registra as tentativas", async () => {
    const { provider } = scriptedProvider([{ error: "UNAVAILABLE" }, { error: "RATE_LIMITED" }, { output: "{}" }]);
    const { gateway, sleeps, limits } = gatewayWith(provider);
    const result = await gateway.call({ config: CONFIG, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal });
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
      gateway.call({ config: CONFIG, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
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
      gateway.call({ config: CONFIG, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code, attempts: 1 });
    expect(calls()).toBe(1);
  });

  it("erro bruto do provedor vira AI_PROVIDER_ERROR sem a mensagem interna", async () => {
    const { provider } = scriptedProvider([{ throw: new Error("sk-secret leaked in message") }]);
    const { gateway, limits } = gatewayWith(provider);
    const failure = await gateway
      .call({ config: CONFIG, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AiFailure);
    expect((failure as AiFailure).code).toBe("AI_PROVIDER_ERROR");
    expect(String((failure as AiFailure).message)).not.toContain("sk-secret");
  });

  it("chamada mais lenta que o tempo limite é interrompida e repetida; sem sucesso → AI_TIMEOUT", async () => {
    const { provider, calls } = scriptedProvider([{ hang: true }]);
    const { gateway, limits } = gatewayWith(provider, { modelCallTimeoutMs: 20 });
    await expect(
      gateway.call({ config: CONFIG, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_TIMEOUT", attempts: 3 });
    expect(calls()).toBe(3);
  });

  it("o prazo total corta a chamada e não é repetido", async () => {
    const { provider, calls } = scriptedProvider([{ hang: true }]);
    const { gateway, limits } = gatewayWith(provider);
    await expect(
      gateway.call({ config: CONFIG, request: REQUEST, limits, deadline: future(30), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_TIMEOUT", attempts: 1 });
    expect(calls()).toBe(1);
    await expect(
      gateway.call({ config: CONFIG, request: REQUEST, limits, deadline: new Date(Date.now() - 1), signal: new AbortController().signal }),
    ).rejects.toMatchObject({ code: "AI_TIMEOUT", attempts: 0 });
  });

  it("006/FR-027 cancelamento interrompe a chamada → AI_EXECUTION_CANCELLED, sem nova tentativa", async () => {
    const { provider, calls } = scriptedProvider([{ hang: true }]);
    const { gateway, limits } = gatewayWith(provider);
    const controller = new AbortController();
    const pending = gateway.call({ config: CONFIG, request: REQUEST, limits, deadline: future(), signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: "AI_EXECUTION_CANCELLED" });
    expect(calls()).toBe(1);
  });

  it("maxRetries 0 → uma tentativa só", async () => {
    const { provider, calls } = scriptedProvider([{ error: "UNAVAILABLE" }]);
    const { gateway, limits } = gatewayWith(provider, { maxRetries: 0 });
    await expect(
      gateway.call({ config: CONFIG, request: REQUEST, limits, deadline: future(), signal: new AbortController().signal }),
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
      config: CONFIG,
      request: REQUEST,
      limits,
      deadline: future(),
      signal: new AbortController().signal,
      structuredSchema: { type: "object" },
    });
    expect(seen).toEqual([{ type: "object" }]);
  });
});
