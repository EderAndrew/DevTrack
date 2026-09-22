import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient, apiRequest, NETWORK_ERROR, UNEXPECTED_RESPONSE } from "./api-client";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the request to fail");
}

describe("apiClient requests", () => {
  it("GET /api/<path>, same-origin credentials, no body", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await expect(apiClient.get("/me")).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/me");
    expect(init).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store" });
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toMatchObject({ Accept: "application/json" });
  });

  it("POST sends JSON", async () => {
    fetchMock.mockResolvedValueOnce(json(202, { message: "ok" }));
    await apiClient.post("/auth/signup", { name: "Ana", email: "ana@example.com", password: "x" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({ name: "Ana", email: "ana@example.com", password: "x" });
  });

  it("unsafe methods without body still send a JSON body (API CSRF rule)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(apiClient.post("/auth/logout")).resolves.toBeUndefined();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.body).toBe("{}");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("server-side calls use the given base URL and forward the cookie", async () => {
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await apiRequest("/me", { baseUrl: "http://api:4000/api", cookie: "__Host-devtrack_session=abc" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://api:4000/api/me");
    expect(init?.headers).toMatchObject({ Cookie: "__Host-devtrack_session=abc" });
  });
});

describe("apiClient error mapping", () => {
  it.each([
    [400, "WEAK_PASSWORD", "A senha não atende aos requisitos."],
    [401, "INVALID_CREDENTIALS", "E-mail ou senha incorretos."],
    [403, "EMAIL_NOT_VERIFIED", "Verifique seu e-mail para continuar."],
    [404, "NOT_FOUND", "Recurso não encontrado."],
    [409, "INVALID_STATE_TRANSITION", "Operação não permitida no estado atual."],
  ])("%i %s → ApiError with status, code and message", async (status, code, message) => {
    fetchMock.mockResolvedValueOnce(json(status, { statusCode: status, code, message }));
    const error = await caught(apiClient.post("/x", {}));
    expect(error).toMatchObject({ status, code, message, retryAfterSeconds: null });
  });

  it("429 carries Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(
      json(429, { statusCode: 429, code: "RATE_LIMITED", message: "Muitas tentativas." }, { "Retry-After": "120" }),
    );
    const error = await caught(apiClient.post("/auth/login", {}));
    expect(error).toMatchObject({ status: 429, code: "RATE_LIMITED", retryAfterSeconds: 120 });
  });

  it("a non-catalogue body (e.g. proxy HTML) → UNEXPECTED_RESPONSE with a generic message", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502 }));
    const error = await caught(apiClient.get("/me"));
    expect(error).toMatchObject({ status: 502, code: UNEXPECTED_RESPONSE });
    expect(error.message).not.toContain("Bad Gateway");
  });

  it("a network failure → status 0, NETWORK_ERROR", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const error = await caught(apiClient.get("/me"));
    expect(error).toMatchObject({ status: 0, code: NETWORK_ERROR });
  });

  it("aborts propagate untouched", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(apiClient.get("/me")).rejects.toMatchObject({ name: "AbortError" });
  });
});
