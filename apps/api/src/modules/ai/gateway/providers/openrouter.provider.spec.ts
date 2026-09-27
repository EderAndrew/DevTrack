import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelRequest } from "../../definitions/types";
import { ProviderError } from "../provider-errors";
import { OPENROUTER_BASE_URL, OpenRouterProvider } from "./openrouter.provider";

/** A fake key the scans look for; never a real credential. */
const FAKE_KEY = "sk-or-teste-008-CHAVE-FALSA";
const PROVIDER_SECRET = "MENSAGEM-INTERNA-DO-PROVEDOR-008";
const BASE_URL = "http://127.0.0.1:9/api/v1";

interface Received {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

const received: Received[] = [];
afterEach(() => {
  received.length = 0;
  vi.restoreAllMocks();
});

type Answer = (signal: AbortSignal) => Promise<Response> | Response;

/** An injected `fetch` that records the request and answers with `answer`; nothing leaves the machine. */
function fetchWith(answer: Answer): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    received.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    return answer(init!.signal!);
  }) as typeof fetch;
}

const json = (status: number, body: unknown): Answer => () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const completion = (message: Record<string, unknown>, finishReason: string | null, extra: Record<string, unknown> = {}) => ({
  id: "gen-teste",
  model: "anthropic/claude-opus-5",
  choices: [{ index: 0, finish_reason: finishReason, message: { role: "assistant", ...message } }],
  usage: { prompt_tokens: 1200, completion_tokens: 340, total_tokens: 1540, cost: 0.0142 },
  ...extra,
});

const provider = (answer: Answer, baseUrl: string | null = BASE_URL) => new OpenRouterProvider({ apiKey: FAKE_KEY, baseUrl, fetch: fetchWith(answer) });
const signal = () => new AbortController().signal;

const REQUEST: ModelRequest = {
  model: "anthropic/claude-opus-5",
  parameters: { effort: "low", temperature: 0.2, top_p: 0.9, seed: 7 },
  maxOutputTokens: 16_000,
  system: "INSTRUCOES-DO-SISTEMA",
  context: { documentId: "11111111-1111-4111-8111-111111111111" },
  untrusted: [{ source: "input", text: "<<BLOCO-NAO-CONFIAVEL>>" }],
  tools: [
    {
      key: "read-curriculum-document",
      description: "Lê o documento.",
      inputJsonSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        required: ["documentId"],
        properties: { documentId: { type: "string", format: "uuid", pattern: "^[0-9a-f-]+$" } },
      },
    },
  ],
  history: [],
};

const lastBody = () => received[received.length - 1]!.body!;

describe("008/FR-004 OpenRouterProvider — requisição (contracts/openrouter-provider.md)", () => {
  it("008/US4-5 envia system, contexto e blocos não confiáveis na primeira mensagem user, ferramentas strict, parâmetros permitidos e a política de dados", async () => {
    await provider(json(200, completion({ content: "ok" }, "stop"))).generate(REQUEST, signal());

    const { url, method, headers } = received[0]!;
    expect(url).toBe(`${BASE_URL}/chat/completions`);
    expect(method).toBe("POST");
    expect(headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-title"]).toBe("DevTrack");
    expect(headers).not.toHaveProperty("http-referer");

    const body = lastBody();
    expect(body).toMatchObject({
      model: "anthropic/claude-opus-5",
      max_tokens: 16_000,
      temperature: 0.2,
      top_p: 0.9,
      reasoning: { effort: "low" },
      tool_choice: "auto",
      provider: { data_collection: "deny", zdr: true, require_parameters: true },
      usage: { include: true },
      stream: false,
    });
    for (const forbidden of ["models", "route", "transforms", "user", "seed", "response_format"]) expect(body, forbidden).not.toHaveProperty(forbidden);
    expect(body.messages).toEqual([
      { role: "system", content: "INSTRUCOES-DO-SISTEMA" },
      {
        role: "user",
        content: [
          { type: "text", text: JSON.stringify(REQUEST.context) },
          { type: "text", text: "<<BLOCO-NAO-CONFIAVEL>>" },
        ],
      },
    ]);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "read-curriculum-document",
          description: "Lê o documento.",
          strict: true,
          parameters: {
            type: "object",
            additionalProperties: false,
            required: ["documentId"],
            properties: { documentId: { type: "string", format: "uuid" } },
          },
        },
      },
    ]);
  });

  it("generateStructured acrescenta response_format com o esquema saneado", async () => {
    const schema = { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string", maxLength: 5 } } };
    await provider(json(200, completion({ content: "{}" }, "stop"))).generateStructured(REQUEST, schema, signal());
    expect(lastBody().response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "output", strict: true, schema: { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" } } } },
    });
  });

  it("histórico: tool_calls com ids call_<n> e argumentos em JSON, e uma mensagem tool por resultado", async () => {
    await provider(json(200, completion({ content: "ok" }, "stop"))).generate(
      {
        ...REQUEST,
        history: [
          { role: "assistant", toolCalls: [{ toolKey: "a", arguments: { x: 1 } }, { toolKey: "b", arguments: { y: 2 } }] },
          { role: "tool", toolKey: "a", content: { source: "tool:a", text: "<<RESULTADO-A>>" } },
          { role: "tool", toolKey: "b", content: { source: "tool:b", text: "<<RESULTADO-B>>" } },
          { role: "assistant", toolCalls: [{ toolKey: "a", arguments: undefined }] },
          { role: "tool", toolKey: "a", content: { source: "tool:a", text: "<<RESULTADO-C>>" } },
        ],
      },
      signal(),
    );
    const messages = lastBody().messages as unknown[];
    expect(messages.slice(2)).toEqual([
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "a", arguments: '{"x":1}' } },
          { id: "call_2", type: "function", function: { name: "b", arguments: '{"y":2}' } },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: "<<RESULTADO-A>>" },
      { role: "tool", tool_call_id: "call_2", content: "<<RESULTADO-B>>" },
      { role: "assistant", content: null, tool_calls: [{ id: "call_3", type: "function", function: { name: "a", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "call_3", content: "<<RESULTADO-C>>" },
    ]);
  });

  it("um resultado sem a chamada correspondente → INVALID_REQUEST, sem chamar o provedor", async () => {
    const error = await provider(json(200, completion({ content: "ok" }, "stop")))
      .generate({ ...REQUEST, history: [{ role: "tool", toolKey: "a", content: { source: "tool:a", text: "x" } }] }, signal())
      .catch((e: unknown) => e);
    expect((error as ProviderError).category).toBe("INVALID_REQUEST");
    expect(received).toHaveLength(0);
  });

  it("sem ferramentas não envia tools nem tool_choice; esforço desconhecido e parâmetros fora da lista não são enviados", async () => {
    await provider(json(200, completion({ content: "ok" }, "stop"))).generate({ ...REQUEST, tools: [], parameters: { effort: "turbo", temperature: "alta" } }, signal());
    const body = lastBody();
    for (const absent of ["tools", "tool_choice", "reasoning", "temperature", "top_p"]) expect(body, absent).not.toHaveProperty(absent);
  });

  it("sem baseUrl usa a URL pública do OpenRouter", async () => {
    await provider(json(200, completion({ content: "ok" }, "stop")), null).generate(REQUEST, signal());
    expect(OPENROUTER_BASE_URL).toBe("https://openrouter.ai/api/v1");
    expect(received[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });
});

describe("008/FR-004 OpenRouterProvider — resposta", () => {
  it("tool_calls → chamadas com argumentos lidos do JSON (argumento inválido → undefined), uso, custo e modelo servido", async () => {
    const response = await provider(
      json(
        200,
        completion(
          {
            content: "Vou ler o documento.",
            tool_calls: [
              { id: "t1", type: "function", function: { name: "read-curriculum-document", arguments: '{"documentId":"d1"}' } },
              { id: "t2", type: "function", function: { name: "read-curriculum-document", arguments: "{quebrado" } },
            ],
          },
          "tool_calls",
          { model: "anthropic/claude-opus-5-20260901" },
        ),
      ),
    ).generate(REQUEST, signal());
    expect(response).toEqual({
      kind: "tool_calls",
      calls: [
        { toolKey: "read-curriculum-document", arguments: { documentId: "d1" } },
        { toolKey: "read-curriculum-document", arguments: undefined },
      ],
      usage: { inputTokens: 1200, outputTokens: 340, totalTokens: 1540, cost: { amount: "0.0142", currency: "USD" } },
      servedModel: "anthropic/claude-opus-5-20260901",
    });
  });

  it("stop → output com o conteúdo", async () => {
    expect(await provider(json(200, completion({ content: '{"a":"b"}' }, "stop"))).generateStructured(REQUEST, { type: "object" }, signal())).toMatchObject({
      kind: "output",
      text: '{"a":"b"}',
      servedModel: "anthropic/claude-opus-5",
    });
  });

  it.each(["length", "content_filter", "error", null])("%s → texto vazio (o validador recusa a saída)", async (reason) => {
    const response = await provider(json(200, completion({ content: `{"parcial": "${PROVIDER_SECRET}"` }, reason))).generate(REQUEST, signal());
    expect(response).toMatchObject({ kind: "output", text: "" });
    expect(JSON.stringify(response)).not.toContain(PROVIDER_SECRET);
  });

  it("sem uso na resposta → usage null; sem custo → cost null", async () => {
    const { usage: _usage, ...noUsage } = completion({ content: "ok" }, "stop");
    expect((await provider(json(200, noUsage)).generate(REQUEST, signal())).usage).toBeNull();
    const noCost = completion({ content: "ok" }, "stop", { usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } });
    expect((await provider(json(200, noCost)).generate(REQUEST, signal())).usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3, cost: null });
  });

  it("modelo servido diferente do pedido → ProviderError UNKNOWN (sem fallback, não transitório)", async () => {
    const error = await provider(json(200, completion({ content: "ok" }, "stop", { model: "openai/gpt-5" })))
      .generate(REQUEST, signal())
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).category).toBe("UNKNOWN");
  });
});

describe("008/FR-005 OpenRouterProvider — erros normalizados, sem mensagem, corpo, pedido ou chave", () => {
  const expectClean = (error: unknown, category: string) => {
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).category).toBe(category);
    expect((error as Error).cause).toBeUndefined();
    const serialized = `${(error as Error).message} ${(error as Error).stack} ${JSON.stringify(error)}`;
    for (const secret of [PROVIDER_SECRET, FAKE_KEY, "INSTRUCOES-DO-SISTEMA", "BLOCO-NAO-CONFIAVEL"]) expect(serialized, secret).not.toContain(secret);
  };
  const apiError = (code: number, metadata?: object) => ({ error: { code, message: PROVIDER_SECRET, ...(metadata ? { metadata } : {}) } });

  it.each([
    [400, "INVALID_REQUEST"],
    [404, "INVALID_REQUEST"],
    [413, "INVALID_REQUEST"],
    [422, "INVALID_REQUEST"],
    [401, "AUTH"],
    [402, "AUTH"],
    [403, "AUTH"],
    [408, "TIMEOUT"],
    [429, "RATE_LIMITED"],
    [500, "UNAVAILABLE"],
    [502, "UNAVAILABLE"],
    [503, "UNAVAILABLE"],
    [504, "UNAVAILABLE"],
    [529, "UNAVAILABLE"],
    [418, "UNKNOWN"],
  ])("HTTP %d → %s", async (status, category) => {
    const log = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "debug")];
    const error = await provider(json(status, apiError(status)))
      .generate(REQUEST, signal())
      .catch((e: unknown) => e);
    expectClean(error, category);
    for (const spy of log) {
      for (const args of spy.mock.calls) expect(JSON.stringify(args)).not.toMatch(new RegExp(`${PROVIDER_SECRET}|${FAKE_KEY}`));
    }
    expect(received).toHaveLength(1); // the gateway owns the retries
  });

  it("403 com metadados de moderação → INVALID_REQUEST (política, não credencial)", async () => {
    const error = await provider(json(403, apiError(403, { reasons: ["violence"], flagged_input: PROVIDER_SECRET })))
      .generate(REQUEST, signal())
      .catch((e: unknown) => e);
    expectClean(error, "INVALID_REQUEST");
  });

  it.each([
    [502, "UNAVAILABLE"],
    [429, "RATE_LIMITED"],
    [400, "INVALID_REQUEST"],
  ])("erro %d dentro de um corpo 200 → %s", async (code, category) => {
    const error = await provider(json(200, apiError(code)))
      .generate(REQUEST, signal())
      .catch((e: unknown) => e);
    expectClean(error, category);
  });

  it("corpo ilegível ou sem choices → UNKNOWN", async () => {
    const garbage: Answer = () => new Response(`não é json ${PROVIDER_SECRET}`, { status: 200 });
    expectClean(await provider(garbage).generate(REQUEST, signal()).catch((e: unknown) => e), "UNKNOWN");
    expectClean(await provider(json(200, { id: "x", model: "anthropic/claude-opus-5" })).generate(REQUEST, signal()).catch((e: unknown) => e), "UNKNOWN");
  });

  it("erro de rede → UNAVAILABLE, sem a mensagem da falha", async () => {
    const network: Answer = () => Promise.reject(new TypeError(`fetch failed ${PROVIDER_SECRET} ${FAKE_KEY}`));
    expectClean(await provider(network).generate(REQUEST, signal()).catch((e: unknown) => e), "UNAVAILABLE");
  });

  it("signal abortado → a chamada recebe o signal e termina em ProviderError", async () => {
    const controller = new AbortController();
    const hang: Answer = (s) =>
      new Promise<Response>((_resolve, reject) => s.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
    const pending = provider(hang)
      .generate(REQUEST, controller.signal)
      .catch((e: unknown) => e);
    await vi.waitFor(() => expect(received).toHaveLength(1));
    controller.abort();
    expect(await pending).toBeInstanceOf(ProviderError);
  });

  it("a chave não aparece ao serializar o provedor", () => {
    const p = provider(json(200, {}));
    expect(`${JSON.stringify(p)} ${String(p)} ${Object.keys(p).join(",")}`).not.toContain(FAKE_KEY);
  });
});

describe("008/FR-004 OpenRouterProvider — healthCheck", () => {
  it("UP quando GET /key responde 200", async () => {
    expect(await provider(json(200, { data: { label: "x" } })).healthCheck(signal())).toBe("UP");
    expect(received[0]).toMatchObject({ method: "GET", url: `${BASE_URL}/key` });
    expect(received[0]!.headers.authorization).toBe(`Bearer ${FAKE_KEY}`);
  });

  it.each([401, 500])("DOWN com HTTP %d", async (status) => {
    expect(await provider(json(status, { error: { code: status, message: PROVIDER_SECRET } })).healthCheck(signal())).toBe("DOWN");
  });

  it("DOWN com erro de rede", async () => {
    expect(await provider(() => Promise.reject(new TypeError("fetch failed"))).healthCheck(signal())).toBe("DOWN");
  });
});
