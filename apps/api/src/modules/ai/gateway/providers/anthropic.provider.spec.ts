import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { APIConnectionTimeoutError } from "@anthropic-ai/sdk";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ModelRequest } from "../../definitions/types";
import { ProviderError } from "../provider-errors";
import { ANTHROPIC_FALLBACK_BETA, AnthropicProvider, providerErrorCategory } from "./anthropic.provider";

/** A fake key the scans look for; never a real credential. */
const FAKE_KEY = "sk-ant-teste-007-CHAVE-FALSA";
const PROVIDER_SECRET = "MENSAGEM-INTERNA-DO-PROVEDOR-007";

interface Received {
  method: string;
  url: string;
  headers: IncomingMessage["headers"];
  body: Record<string, unknown> | null;
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** A local stand-in for the Messages API: every test sets `handler`; nothing leaves the machine. */
let server: Server;
let baseUrl: string;
let handler: Handler;
const received: Received[] = [];

const reply = (status: number, body: unknown, headers: Record<string, string> = {}): Handler => (_req, res) => {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
};

const message = (content: unknown[], stopReason: string, usage = { input_tokens: 1200, output_tokens: 340 }) => ({
  id: "msg_teste",
  type: "message",
  role: "assistant",
  model: "claude-opus-5",
  content,
  stop_reason: stopReason,
  stop_sequence: null,
  usage,
});

const apiError = (type: string) => ({ type: "error", error: { type, message: PROVIDER_SECRET } });

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => (raw += chunk.toString("utf8")));
    req.on("end", () => {
      received.push({ method: req.method!, url: req.url!, headers: req.headers, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null });
      handler(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => {
  received.length = 0;
  vi.restoreAllMocks();
});

const provider = () => new AnthropicProvider({ apiKey: FAKE_KEY, baseUrl });
const signal = () => new AbortController().signal;

const REQUEST: ModelRequest = {
  model: "claude-opus-5",
  parameters: { effort: "low" },
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

describe("007/FR-042 AnthropicProvider — requisição (contracts/curriculum-agent.md)", () => {
  it("envia system, o contexto e os blocos não confiáveis na primeira mensagem, ferramentas strict, esforço, thinking adaptativo e o fallback", async () => {
    handler = reply(200, message([{ type: "text", text: "ok" }], "end_turn"));
    await provider().generate(REQUEST, signal());

    const { url, headers } = received[0]!;
    expect(url).toBe("/v1/messages?beta=true");
    expect(headers["x-api-key"]).toBe(FAKE_KEY);
    expect(headers["anthropic-beta"]).toContain(ANTHROPIC_FALLBACK_BETA);
    expect(ANTHROPIC_FALLBACK_BETA).toBe("server-side-fallback-2026-07-01");

    const body = lastBody();
    expect(body).toMatchObject({
      model: "claude-opus-5",
      max_tokens: 16_000,
      system: "INSTRUCOES-DO-SISTEMA",
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      fallbacks: "default",
      tool_choice: { type: "auto" },
    });
    expect(body).not.toHaveProperty("betas");
    expect((body.output_config as object)).not.toHaveProperty("format");
    expect(body.messages).toEqual([
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
        name: "read-curriculum-document",
        description: "Lê o documento.",
        strict: true,
        input_schema: {
          type: "object",
          additionalProperties: false,
          required: ["documentId"],
          properties: { documentId: { type: "string", format: "uuid" } },
        },
      },
    ]);
  });

  it("generateStructured acrescenta output_config.format com o esquema saneado", async () => {
    handler = reply(200, message([{ type: "text", text: "{}" }], "end_turn"));
    const schema = { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string", maxLength: 5 } } };
    await provider().generateStructured(REQUEST, schema, signal());
    expect(lastBody().output_config).toEqual({
      effort: "low",
      format: { type: "json_schema", schema: { type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" } } } },
    });
  });

  it("histórico: tool_use com ids call_<n> e todos os resultados de um turno numa só mensagem user", async () => {
    handler = reply(200, message([{ type: "text", text: "ok" }], "end_turn"));
    await provider().generate(
      {
        ...REQUEST,
        history: [
          { role: "assistant", toolCalls: [{ toolKey: "a", arguments: { x: 1 } }, { toolKey: "b", arguments: { y: 2 } }] },
          { role: "tool", toolKey: "a", content: { source: "tool:a", text: "<<RESULTADO-A>>" } },
          { role: "tool", toolKey: "b", content: { source: "tool:b", text: "<<RESULTADO-B>>" } },
          { role: "assistant", toolCalls: [{ toolKey: "a", arguments: {} }] },
          { role: "tool", toolKey: "a", content: { source: "tool:a", text: "<<RESULTADO-C>>" } },
        ],
      },
      signal(),
    );
    const messages = lastBody().messages as unknown[];
    expect(messages.slice(1)).toEqual([
      {
        role: "assistant",
        content: [
          { type: "tool_use", id: "call_1", name: "a", input: { x: 1 } },
          { type: "tool_use", id: "call_2", name: "b", input: { y: 2 } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "<<RESULTADO-A>>" },
          { type: "tool_result", tool_use_id: "call_2", content: "<<RESULTADO-B>>" },
        ],
      },
      { role: "assistant", content: [{ type: "tool_use", id: "call_3", name: "a", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_3", content: "<<RESULTADO-C>>" }] },
    ]);
  });

  it("sem ferramentas não envia tools nem tool_choice; esforço desconhecido não é enviado", async () => {
    handler = reply(200, message([{ type: "text", text: "ok" }], "end_turn"));
    await provider().generate({ ...REQUEST, tools: [], parameters: { effort: "turbo" } }, signal());
    const body = lastBody();
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body.output_config).toEqual({});
  });
});

describe("007/FR-042 AnthropicProvider — resposta", () => {
  it("tool_use → tool_calls, ignorando thinking e texto", async () => {
    handler = reply(
      200,
      message(
        [
          { type: "thinking", thinking: "", signature: "sig" },
          { type: "text", text: "Vou ler o documento." },
          { type: "tool_use", id: "toolu_1", name: "read-curriculum-document", input: { documentId: "d1" } },
        ],
        "tool_use",
      ),
    );
    const response = await provider().generate(REQUEST, signal());
    expect(response).toEqual({
      kind: "tool_calls",
      calls: [{ toolKey: "read-curriculum-document", arguments: { documentId: "d1" } }],
      usage: { inputTokens: 1200, outputTokens: 340, totalTokens: 1540 },
    });
  });

  it("end_turn → output com os blocos de texto juntos", async () => {
    handler = reply(200, message([{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: '{"a":' }, { type: "text", text: '"b"}' }], "end_turn"));
    expect(await provider().generateStructured(REQUEST, { type: "object" }, signal())).toEqual({
      kind: "output",
      text: '{"a":"b"}',
      usage: { inputTokens: 1200, outputTokens: 340, totalTokens: 1540 },
    });
  });

  it.each(["max_tokens", "refusal"])("%s → texto vazio (o validador recusa a saída)", async (stopReason) => {
    handler = reply(200, { ...message([{ type: "text", text: '{"parcial":' }], stopReason), stop_details: stopReason === "refusal" ? { type: "refusal", category: null, explanation: PROVIDER_SECRET } : null });
    const response = await provider().generate(REQUEST, signal());
    expect(response).toMatchObject({ kind: "output", text: "" });
    expect(JSON.stringify(response)).not.toContain(PROVIDER_SECRET);
  });
});

describe("007/FR-042 AnthropicProvider — erros normalizados, sem mensagem, corpo ou chave", () => {
  it.each([
    [429, "rate_limit_error", "RATE_LIMITED"],
    [529, "overloaded_error", "UNAVAILABLE"],
    [500, "api_error", "UNAVAILABLE"],
    [503, "api_error", "UNAVAILABLE"],
    [401, "authentication_error", "AUTH"],
    [403, "permission_error", "AUTH"],
    [400, "invalid_request_error", "INVALID_REQUEST"],
    [404, "not_found_error", "INVALID_REQUEST"],
    [413, "request_too_large", "INVALID_REQUEST"],
    [418, "teapot", "UNKNOWN"],
  ])("HTTP %d → %s", async (status, type, category) => {
    handler = reply(status, apiError(type));
    const log = [vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "debug")];
    const error = await provider()
      .generate(REQUEST, signal())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).category).toBe(category);
    expect((error as Error).cause).toBeUndefined();
    const serialized = `${(error as Error).message} ${(error as Error).stack} ${JSON.stringify(error)}`;
    for (const secret of [PROVIDER_SECRET, FAKE_KEY, type]) expect(serialized, secret).not.toContain(secret);
    for (const spy of log) {
      for (const args of spy.mock.calls) expect(JSON.stringify(args)).not.toMatch(new RegExp(`${PROVIDER_SECRET}|${FAKE_KEY}`));
    }
    expect(received).toHaveLength(1); // maxRetries: 0 — the gateway owns the retries
  });

  it("conexão derrubada → TIMEOUT; tempo de conexão esgotado → TIMEOUT", async () => {
    handler = (req) => req.socket.destroy();
    const error = await provider()
      .generate(REQUEST, signal())
      .catch((e: unknown) => e);
    expect((error as ProviderError).category).toBe("TIMEOUT");
    expect(providerErrorCategory(new APIConnectionTimeoutError())).toBe("TIMEOUT");
  });

  it("signal abortado → a chamada é cancelada", async () => {
    let closed = false;
    handler = (req) => req.socket.on("close", () => (closed = true)); // never answers
    const controller = new AbortController();
    const started = Date.now();
    const pending = provider()
      .generate(REQUEST, controller.signal)
      .catch((e: unknown) => e);
    await vi.waitFor(() => expect(received).toHaveLength(1));
    controller.abort();
    expect(await pending).toBeInstanceOf(ProviderError);
    expect(Date.now() - started).toBeLessThan(2_000);
    await vi.waitFor(() => expect(closed).toBe(true));
  });
});

describe("007/FR-042 AnthropicProvider — healthCheck", () => {
  it("UP quando models.retrieve responde", async () => {
    handler = reply(200, { type: "model", id: "claude-opus-5", display_name: "Claude Opus 5", created_at: "2026-01-01T00:00:00Z" });
    expect(await provider().healthCheck(signal())).toBe("UP");
    expect(received[0]).toMatchObject({ method: "GET", url: "/v1/models/claude-opus-5" });
  });

  it.each([500, 401])("DOWN com HTTP %d", async (status) => {
    handler = reply(status, apiError("api_error"));
    expect(await provider().healthCheck(signal())).toBe("DOWN");
  });
});
