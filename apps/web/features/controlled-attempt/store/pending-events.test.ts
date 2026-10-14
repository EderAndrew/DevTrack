import type { IntegrityEventInput } from "@repo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NETWORK_ERROR } from "@/lib/api/client";
import { isNetworkFailure, isRetryable } from "../api/integrity";
import { createEventQueue, readPendingEvents, type SendEvents, writePendingEvents } from "./pending-events";

// 015/FR-010 (research F4): events queued in this browser and sent in order; without connection
// they wait, buffered, with the browser's time, and the drop and the return are recorded too.

const offline = () => new ApiError(0, NETWORK_ERROR, "");
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OLD_ID = uuid(999);
const SERVER_TIME = "2026-10-01T12:05:00.000Z";

function setup(send: SendEvents) {
  let id = 0;
  let clock = Date.parse("2026-10-01T12:00:00.000Z");
  const queue = createEventQueue({
    userId: "u1",
    activityId: "a1",
    send,
    retryable: isRetryable,
    offline: isNetworkFailure,
    newId: () => uuid(++id),
    now: () => new Date((clock += 1_000)),
  });
  return queue;
}
const accept: SendEvents = async (events) => ({ recorded: events.map((event) => ({ eventId: event.eventId, recordedAt: SERVER_TIME })) });
const types = (events: IntegrityEventInput[]) => events.map((event) => `${event.type}${event.buffered ? "*" : ""}`);

describe("015/FR-010 fila de eventos do modo controlado", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("015/US2-3 envia na hora, sem buffer, e guarda o horário do servidor de cada evento", async () => {
    const send = vi.fn(accept);
    const queue = setup(send);
    const id = queue.record("SCREEN_LEFT");
    await queue.flush();
    expect(send.mock.calls[0]![0]).toEqual([{ eventId: id, type: "SCREEN_LEFT", clientOccurredAt: "2026-10-01T12:00:01.000Z", buffered: false }]);
    expect(queue.recordedAt(id)).toBe(SERVER_TIME);
    expect(queue.pendingCount()).toBe(0);
    expect(readPendingEvents("u1", "a1")).toEqual([]);
  });

  it("015/US2-8 sem conexão: guarda no localStorage como bufferizado, grava CONNECTION_LOST; o primeiro envio que passa acrescenta CONNECTION_RESTORED", async () => {
    const send = vi.fn<SendEvents>().mockRejectedValueOnce(offline());
    const queue = setup(send);
    const left = queue.record("SCREEN_LEFT");
    await queue.flush();
    expect(queue.recordedAt(left)).toBeNull();
    expect(types(readPendingEvents("u1", "a1"))).toEqual(["SCREEN_LEFT*", "CONNECTION_LOST*"]);

    send.mockImplementation(accept);
    queue.record("SCREEN_RETURNED");
    await queue.flush();
    const sent = send.mock.calls.at(-1)![0];
    expect(types(sent)).toEqual(["SCREEN_LEFT*", "CONNECTION_LOST*", "SCREEN_RETURNED", "CONNECTION_RESTORED"]);
    expect(sent.every((event) => event.clientOccurredAt)).toBe(true);
    expect(queue.recordedAt(left)).toBe(SERVER_TIME);
    expect(readPendingEvents("u1", "a1")).toEqual([]);
  });

  it("a queda avisada pelo navegador (offline) também é registrada uma vez só", async () => {
    const send = vi.fn(accept);
    const queue = setup(send);
    queue.connectionLost();
    queue.connectionLost();
    await queue.flush();
    expect(types(send.mock.calls[0]![0])).toEqual(["CONNECTION_LOST*", "CONNECTION_RESTORED"]);
  });

  it("o que ficou de uma visita anterior é reenviado como bufferizado", async () => {
    writePendingEvents("u1", "a1", [{ eventId: OLD_ID, type: "PAGE_LEAVE_ATTEMPTED", clientOccurredAt: "2026-10-01T11:00:00.000Z", buffered: false }]);
    const send = vi.fn(accept);
    const queue = setup(send);
    await queue.flush();
    expect(send.mock.calls[0]![0]).toEqual([{ eventId: OLD_ID, type: "PAGE_LEAVE_ATTEMPTED", clientOccurredAt: "2026-10-01T11:00:00.000Z", buffered: true }]);
  });

  it("429 ou falha do servidor: fica na fila para depois; uma recusa (409) descarta o lote", async () => {
    const send = vi.fn<SendEvents>().mockRejectedValueOnce(new ApiError(429, "RATE_LIMITED", ""));
    const queue = setup(send);
    queue.record("COPY_BLOCKED", "q1");
    await queue.flush();
    expect(queue.pendingCount()).toBe(1);
    send.mockRejectedValueOnce(new ApiError(409, "ATTEMPT_ALREADY_SUBMITTED", ""));
    await queue.flush();
    expect(queue.pendingCount()).toBe(0);
    expect(readPendingEvents("u1", "a1")).toEqual([]);
  });

  it("mais de 50 eventos vão em lotes de 50, na ordem", async () => {
    const send = vi.fn<SendEvents>().mockRejectedValueOnce(offline());
    const queue = setup(send);
    for (let index = 0; index < 60; index += 1) queue.record("PASTE_BLOCKED");
    await queue.flush();
    send.mockImplementation(accept);
    await queue.flush();
    const sizes = send.mock.calls.slice(-2).map(([events]) => events.length);
    expect(sizes).toEqual([50, 12]);
    expect(types(send.mock.calls.at(-1)![0]).at(-1)).toBe("CONNECTION_RESTORED");
  });

  it("018/US4-3 a inatividade vai com idleSeconds, e cada lote confirmado chega com a contagem do servidor", async () => {
    const answers: unknown[] = [];
    let id = 0;
    const queue = createEventQueue({
      userId: "u1",
      activityId: "a1",
      send: async (events) => ({ ...(await accept(events)), exam: { occurrenceCount: 1, held: false } }),
      retryable: isRetryable,
      offline: isNetworkFailure,
      newId: () => uuid(++id),
    });
    queue.subscribeSent((result, events) => answers.push([result.exam, events.map((event) => [event.type, event.idleSeconds])]));
    queue.record("INACTIVITY", undefined, 45);
    await queue.flush();
    expect(answers).toEqual([[{ occurrenceCount: 1, held: false }, [["INACTIVITY", 45]]]]);
  });
});
