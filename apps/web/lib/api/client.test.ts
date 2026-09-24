import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiClient, apiRequest, apiUpload, NETWORK_ERROR, UNEXPECTED_RESPONSE } from "./client";
import { messageForError } from "../messages/error-messages";
import { FakeXhr } from "../../test/fake-xhr";

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
    await apiClient.post("/auth/login", { email: "ana@example.com", password: "x" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual({ email: "ana@example.com", password: "x" });
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

  it("004/E5 a FormData body goes as is, without a manual Content-Type", async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: "doc" }));
    const form = new FormData();
    form.append("file", new File(["%PDF-1.7"], "ementa.pdf", { type: "application/pdf" }));
    await expect(apiRequest("/subjects/s/syllabus-documents", { method: "POST", body: form })).resolves.toEqual({ id: "doc" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.body).toBe(form);
    expect(init?.headers).not.toHaveProperty("Content-Type");
    expect(init?.headers).toMatchObject({ Accept: "application/json" });
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

  it("002/US2-3 a known code with a different server message shows the web catalogue text", async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { statusCode: 401, code: "INVALID_CREDENTIALS", message: "Invalid credentials (server text)." }),
    );
    const error = await caught(apiClient.post("/auth/login", {}));
    expect(error.message).toBe("Invalid credentials (server text).");
    expect(messageForError(error)).toBe("E-mail ou senha incorretos.");
  });

  it("002/US2-3 network and unexpected failures show the web catalogue texts", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(messageForError(await caught(apiClient.get("/me")))).toBe(
      "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
    );
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad Gateway</html>", { status: 502 }));
    expect(messageForError(await caught(apiClient.get("/me")))).toBe("Erro inesperado. Tente novamente mais tarde.");
  });

  it("aborts propagate untouched", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(apiClient.get("/me")).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("apiUpload", () => {
  beforeEach(() => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
  });

  const form = () => {
    const data = new FormData();
    data.append("file", new File(["%PDF-1.7"], "ementa.pdf", { type: "application/pdf" }));
    return data;
  };

  it("004/E5 POSTs the FormData to /api/<path> with no manual Content-Type and resolves the JSON body", async () => {
    const data = form();
    const promise = apiUpload("/subjects/s/syllabus-documents", data);
    const xhr = FakeXhr.last;
    expect(xhr).toMatchObject({ method: "POST", url: "/api/subjects/s/syllabus-documents" });
    expect(xhr.body).toBe(data);
    expect(xhr.headers).toEqual({ Accept: "application/json" });

    xhr.respond(201, JSON.stringify({ id: "doc" }));
    await expect(promise).resolves.toEqual({ id: "doc" });
  });

  it("uses the given base URL, like apiRequest", async () => {
    const promise = apiClient.upload("/x", form(), { baseUrl: "http://api:4000/api" });
    expect(FakeXhr.last.url).toBe("http://api:4000/api/x");
    FakeXhr.last.respond(201, "{}");
    await promise;
  });

  it("004/E5 reports real upload progress as a percentage, and nothing when the size is unknown", async () => {
    const onProgress = vi.fn();
    const promise = apiUpload("/x", form(), { onProgress });
    const xhr = FakeXhr.last;
    xhr.progress(0, 400);
    xhr.progress(100, 400);
    xhr.progress(400, 400);
    xhr.progress(10, 0, false);
    expect(onProgress.mock.calls).toEqual([[0], [25], [100]]);

    xhr.respond(201, "{}");
    await promise;
  });

  it("004/E5 a 413 FILE_TOO_LARGE body → ApiError with status, code and message", async () => {
    const promise = apiUpload("/x", form());
    FakeXhr.last.respond(413, JSON.stringify({ statusCode: 413, code: "FILE_TOO_LARGE", message: "File too large" }));
    const error = await caught(promise);
    expect(error).toMatchObject({ status: 413, code: "FILE_TOO_LARGE", message: "File too large", retryAfterSeconds: null });
  });

  it("429 carries Retry-After; a non-catalogue body → UNEXPECTED_RESPONSE", async () => {
    let promise = apiUpload("/x", form());
    FakeXhr.last.respond(429, JSON.stringify({ statusCode: 429, code: "RATE_LIMITED", message: "x" }), { "Retry-After": "60" });
    expect(await caught(promise)).toMatchObject({ status: 429, code: "RATE_LIMITED", retryAfterSeconds: 60 });

    promise = apiUpload("/x", form());
    FakeXhr.last.respond(502, "<html>Bad Gateway</html>");
    const error = await caught(promise);
    expect(error).toMatchObject({ status: 502, code: UNEXPECTED_RESPONSE });
    expect(error.message).not.toContain("Bad Gateway");
  });

  it("a network failure → status 0, NETWORK_ERROR", async () => {
    const promise = apiUpload("/x", form());
    FakeXhr.last.fail();
    expect(await caught(promise)).toMatchObject({ status: 0, code: NETWORK_ERROR });
  });

  it("004/E5 aborting the signal cancels the request and rejects with AbortError", async () => {
    const controller = new AbortController();
    const promise = apiUpload("/x", form(), { signal: controller.signal });
    const xhr = FakeXhr.last;
    controller.abort();
    expect(xhr.aborted).toBe(true);
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("an already aborted signal rejects without sending anything", async () => {
    const controller = new AbortController();
    controller.abort();
    const before = FakeXhr.last;
    await expect(apiUpload("/x", form(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.last).toBe(before);
  });
});
