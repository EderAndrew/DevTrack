import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelRequest } from "../../src/modules/ai/definitions/types";
import { ProviderError } from "../../src/modules/ai/gateway/provider-errors";
import { OpenRouterProvider } from "../../src/modules/ai/gateway/providers/openrouter.provider";
import { OPENROUTER_MARKER_KEY } from "../helpers/journey";

const REQUEST: ModelRequest = {
  model: "anthropic/claude-opus-5",
  parameters: {},
  maxOutputTokens: 100,
  system: "s",
  context: {},
  untrusted: [],
  tools: [],
  history: [],
};

/** A body that echoes the key back, as a careless upstream error might. */
const echo = (status: number) => new Response(JSON.stringify({ error: { code: status, message: `invalid key ${OPENROUTER_MARKER_KEY}` } }), { status });

type Answer = (signal: AbortSignal) => Promise<Response>;

const ANSWERS: [string, Answer][] = [
  ["sucesso", async () => new Response(JSON.stringify({ model: REQUEST.model, choices: [{ finish_reason: "stop", message: { content: "{}" } }] }), { status: 200 })],
  ["401", async () => echo(401)],
  ["429", async () => echo(429)],
  ["503", async () => echo(503)],
  ["erro de rede", async () => Promise.reject(new TypeError(`fetch failed for Bearer ${OPENROUTER_MARKER_KEY}`))],
  [
    "demora além do sinal",
    (signal) =>
      new Promise<Response>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new DOMException(`aborted ${OPENROUTER_MARKER_KEY}`, "AbortError")), { once: true }),
      ),
  ],
];

/**
 * 008/US4-1 008/SC-005: `OpenRouterProvider` instantiated directly (outside any app, so no test
 * app registers it, T022) with the marker key: whatever the upstream answers, nothing it throws
 * or prints carries the key.
 */
describe("008/US4-1 008/SC-005 a chave do OpenRouter nunca sai do provedor", () => {
  const printed: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    printed.length = 0;
  });

  it.each(ANSWERS)("%s: nenhum erro, serialização nem saída do processo contém a chave", async (_name, answer) => {
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => void printed.push(JSON.stringify(args)));
    }
    const write = process.stdout.write.bind(process.stdout);
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array, ...rest: never[]) => {
      printed.push(String(chunk));
      return write(chunk, ...rest);
    }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: string | Uint8Array) => {
      printed.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);

    const seen: RequestInit[] = [];
    const fetchStub = ((_url: string, init: RequestInit) => {
      seen.push(init);
      return answer(init.signal!);
    }) as unknown as typeof fetch;
    const provider = new OpenRouterProvider({ apiKey: OPENROUTER_MARKER_KEY, baseUrl: "http://127.0.0.1:9/api/v1", fetch: fetchStub });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50);
    const outcome = await provider.generate(REQUEST, controller.signal).then(
      (response) => ({ ok: true as const, value: response }),
      (error: unknown) => ({ ok: false as const, value: error }),
    );
    clearTimeout(timer);
    const health = await provider.healthCheck(AbortSignal.timeout(50)).catch((error: unknown) => error);

    // The key went only where it must: the Authorization header of the request.
    expect(new Headers(seen[0]!.headers).get("authorization")).toBe(`Bearer ${OPENROUTER_MARKER_KEY}`);
    if (!outcome.ok) {
      expect(outcome.value).toBeInstanceOf(ProviderError);
      const error = outcome.value as Error;
      expect(error.cause).toBeUndefined();
    }
    const surfaces = [
      String(outcome.value),
      JSON.stringify(outcome.value),
      (outcome.value as Error)?.stack ?? "",
      (outcome.value as Error)?.message ?? "",
      String(health),
      JSON.stringify(provider),
      String(provider),
      ...printed,
    ].join("\n");
    expect(surfaces.includes(OPENROUTER_MARKER_KEY)).toBe(false);
  });
});
