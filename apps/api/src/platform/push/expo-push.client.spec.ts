import { describe, expect, it } from "vitest";
import { ExpoPushClient, PushRequestRefused } from "./expo-push.client";
import { type PushMessage, PushTransientError, safeErrorCode } from "./push-client";

const ACCESS_TOKEN = "teste-024-TOKEN-EXPO-FALSO-unitario";
const message = (n: number): PushMessage => ({
  to: `ExponentPushToken[aaaaaaaaaa${n}]`,
  channelId: "exam-occurrences",
  title: "Ocorrência na prova",
  body: "Ana — Aviso 1 de 3 — Prova (T1)",
  data: { kind: "OCCURRENCE", classId: "c", activityId: "a", studentUserId: "s" },
  priority: "high",
  sound: "default",
});

interface Call {
  url: string;
  init: RequestInit;
}

function fetchAnswering(status: number, body: unknown, calls: Call[] = []): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}

const client = (fetchFn: typeof fetch) => new ExpoPushClient({ baseUrl: "https://exp.host/qualquer", accessToken: ACCESS_TOKEN, fetch: fetchFn });

describe("024 ExpoPushClient: Expo Push por fetch, sem SDK (research Y6)", () => {
  it("envia o lote para /--/api/v2/push/send com o token de acesso e devolve um ticket por mensagem", async () => {
    const calls: Call[] = [];
    const tickets = await client(
      fetchAnswering(200, { data: [{ status: "ok", id: "t-1" }, { status: "error", message: "texto do Expo", details: { error: "DeviceNotRegistered" } }] }, calls),
    ).send([message(1), message(2)]);
    expect(tickets).toEqual([
      { ok: true, ticketId: "t-1" },
      { ok: false, errorCode: "DeviceNotRegistered" },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://exp.host/--/api/v2/push/send");
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(JSON.parse(String(calls[0]!.init.body))).toHaveLength(2);
    expect(calls[0]!.init.redirect).toBe("error");
  });

  it("um código de erro que não é código vira UnknownError (nunca a mensagem)", async () => {
    const [ticket] = await client(fetchAnswering(200, { data: [{ status: "error", details: { error: "Algo <b>estranho</b>" } }] })).send([message(1)]);
    expect(ticket).toEqual({ ok: false, errorCode: "UnknownError" });
    expect(safeErrorCode(undefined)).toBe("UnknownError");
    expect(safeErrorCode("MessageRateExceeded")).toBe("MessageRateExceeded");
  });

  it("429, 5xx, rede, tempo esgotado e resposta incompleta são falhas transitórias", async () => {
    await expect(client(fetchAnswering(429, {})).send([message(1)])).rejects.toMatchObject({ reason: "RATE_LIMITED" });
    await expect(client(fetchAnswering(503, {})).send([message(1)])).rejects.toMatchObject({ reason: "SERVER" });
    await expect(client(fetchAnswering(200, "não é json")).send([message(1)])).rejects.toBeInstanceOf(PushTransientError);
    await expect(client(fetchAnswering(200, { data: [] })).send([message(1)])).rejects.toMatchObject({ reason: "SERVER" });
    const offline = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(client(offline).send([message(1)])).rejects.toMatchObject({ reason: "NETWORK" });
    const slow = (async (_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))) as unknown as typeof fetch;
    await expect(new ExpoPushClient({ baseUrl: "https://exp.host", accessToken: null, fetch: slow, timeoutMs: 20 }).send([message(1)])).rejects.toMatchObject({
      reason: "TIMEOUT",
    });
  });

  it("um 4xx recusa o pedido inteiro, sem expor o token nem o corpo", async () => {
    const error = await client(fetchAnswering(401, { errors: [{ message: "bad token" }] }))
      .send([message(1)])
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PushRequestRefused);
    expect(String((error as Error).message)).not.toContain(ACCESS_TOKEN);
    expect(String((error as Error).message)).not.toContain("Ana");
  });

  it("lê os recibos em /getReceipts; ids que o Expo ainda não conhece ficam de fora", async () => {
    const calls: Call[] = [];
    const receipts = await client(
      fetchAnswering(200, { data: { "t-1": { status: "ok" }, "t-2": { status: "error", details: { error: "DeviceNotRegistered" } } } }, calls),
    ).getReceipts(["t-1", "t-2", "t-3"]);
    expect(calls[0]!.url).toBe("https://exp.host/--/api/v2/push/getReceipts");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ ids: ["t-1", "t-2", "t-3"] });
    expect([...receipts]).toEqual([
      ["t-1", { ok: true }],
      ["t-2", { ok: false, errorCode: "DeviceNotRegistered" }],
    ]);
  });

  it("respeita os limites do Expo por pedido e não chama nada sem mensagens", async () => {
    const calls: Call[] = [];
    const push = client(fetchAnswering(200, { data: [] }, calls));
    expect(await push.send([])).toEqual([]);
    expect(await push.getReceipts([])).toEqual(new Map());
    expect(calls).toHaveLength(0);
    await expect(push.send(Array.from({ length: 101 }, (_, n) => message(n)))).rejects.toThrow(/at most 100/);
    await expect(push.getReceipts(Array.from({ length: 301 }, (_, n) => `t-${n}`))).rejects.toThrow(/at most 300/);
  });
});
