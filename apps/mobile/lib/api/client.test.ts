import { z } from "zod";
import { ApiError, createApiClient, NETWORK_ERROR, UNEXPECTED_RESPONSE } from "./client";

interface Call {
  url: string;
  init: RequestInit;
}

const TOKEN = "a".repeat(43);

function fetchAnswering(status: number, body: unknown, calls: Call[], headers: Record<string, string> = {}): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
  }) as unknown as typeof fetch;
}

function client(fetchFn: typeof fetch, onUnauthorized = jest.fn(), token: string | null = TOKEN) {
  return { api: createApiClient({ origin: "https://devtrack.exemplo.br/qualquer", getToken: async () => token, onUnauthorized, fetch: fetchFn }), onUnauthorized };
}

describe("024 cliente HTTP do app (contracts/mobile-ui.md, research Y4)", () => {
  it("024/FR-003 manda a sessão como Bearer para a origem da API, sem cookie, e valida a resposta pelo contrato", async () => {
    const calls: Call[] = [];
    const { api } = client(fetchAnswering(200, { muted: true }, calls));
    const result = await api.request("GET", "/mobile/exams", { schema: z.strictObject({ muted: z.boolean() }) });
    expect(result).toEqual({ muted: true });
    expect(calls[0]!.url).toBe("https://devtrack.exemplo.br/api/mobile/exams");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers.Cookie).toBeUndefined();
    expect(headers["Content-Type"]).toBeUndefined();
    expect(calls[0]!.init.body).toBeUndefined();
    expect(calls[0]!.init.credentials).toBe("omit");
  });

  it("024/FR-005 método inseguro sempre com Content-Type JSON e {} quando não há corpo", async () => {
    const calls: Call[] = [];
    const { api } = client(fetchAnswering(204, undefined, calls));
    await api.request("DELETE", "/auth/mobile/sessions/current");
    expect((calls[0]!.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(calls[0]!.init.body).toBe("{}");
  });

  it("o login vai sem sessão", async () => {
    const calls: Call[] = [];
    const { api } = client(fetchAnswering(204, undefined, calls));
    await api.request("POST", "/auth/mobile/sessions", { body: { email: "a@b.c", password: "x" }, anonymous: true });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ email: "a@b.c", password: "x" });
  });

  it("uma recusa vira ApiError com o código da API e a espera do Retry-After", async () => {
    const { api } = client(fetchAnswering(429, { statusCode: 429, code: "RATE_LIMITED", message: "x" }, [], { "Retry-After": "90" }));
    await expect(api.request("POST", "/mobile/device", { body: {} })).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED", retryAfterSeconds: 90 });
  });

  it("024/US1-5 um 401 com sessão avisa que ela acabou; sem sessão, não", async () => {
    const unauthorized = { statusCode: 401, code: "UNAUTHENTICATED", message: "x" };
    const withSession = client(fetchAnswering(401, unauthorized, []));
    await expect(withSession.api.request("GET", "/me")).rejects.toBeInstanceOf(ApiError);
    expect(withSession.onUnauthorized).toHaveBeenCalledTimes(1);
    const anonymous = client(fetchAnswering(401, { ...unauthorized, code: "INVALID_CREDENTIALS" }, []));
    await expect(anonymous.api.request("POST", "/auth/mobile/sessions", { body: {}, anonymous: true })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(anonymous.onUnauthorized).not.toHaveBeenCalled();
  });

  it("sem rede, corpo fora do contrato ou erro sem formato viram códigos do cliente", async () => {
    const offline = (async () => {
      throw new TypeError("Network request failed");
    }) as unknown as typeof fetch;
    await expect(client(offline).api.request("GET", "/me")).rejects.toMatchObject({ status: 0, code: NETWORK_ERROR });
    await expect(client(fetchAnswering(200, { muted: "sim" }, [])).api.request("GET", "/x", { schema: z.strictObject({ muted: z.boolean() }) })).rejects.toMatchObject({
      code: UNEXPECTED_RESPONSE,
    });
    await expect(client(fetchAnswering(502, "<html>", [])).api.request("GET", "/x")).rejects.toMatchObject({ status: 502, code: UNEXPECTED_RESPONSE });
  });

  it("só caminhos da própria API", async () => {
    const { api } = client(fetchAnswering(200, {}, []));
    await expect(api.request("GET", "//outro.host/x")).rejects.toThrow(/caminho inválido/);
    await expect(api.request("GET", "https://outro.host/x")).rejects.toThrow(/caminho inválido/);
  });
});
