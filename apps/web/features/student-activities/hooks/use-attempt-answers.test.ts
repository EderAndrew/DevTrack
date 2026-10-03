import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPendingAnswers, writePendingAnswers } from "../store/pending-answers";
import { SAVE_DEBOUNCE_MS, useAttemptAnswers } from "./use-attempt-answers";

// 012/US3 research P8, P22: autosave 1,5 s after the last change, on flush and when the page is
// hidden; offline answers kept in this browser and sent when the connection returns; a CONFLICT
// replaces the local copy; "Tentar novamente" sends what is on screen.

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const saved = (...items: [string, number][]) => ({
  savedAt: "2026-10-01T12:00:00.000Z",
  results: items.map(([questionId, revision]) => ({ questionId, outcome: "SAVED", revision })),
});
const text = (value: string) => ({ kind: "TEXT" as const, text: value });

describe("012/US3 012/FR-018 012/FR-019 salvamento automático das respostas", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const sentBodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
  const setup = (serverAnswers = [{ questionId: "q1", answer: text("do servidor"), revision: 3 }]) =>
    renderHook(() => useAttemptAnswers({ userId: "u1", activityId: "a1", serverAnswers, enabled: true }));
  const setOnline = (online: boolean) => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
    window.dispatchEvent(new Event(online ? "online" : "offline"));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("salva 1,5 s depois da última mudança, com a revisão vista, e mostra salvo", async () => {
    fetchMock.mockResolvedValue(reply(200, saved(["q1", 4])));
    const { result } = setup();
    expect(result.current.answerOf("q1")).toEqual(text("do servidor"));

    act(() => result.current.setAnswer("q1", text("um")));
    act(() => vi.advanceTimersByTime(1_000));
    act(() => result.current.setAnswer("q1", text("um dois")));
    act(() => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1));
    expect(fetchMock).not.toHaveBeenCalled();
    // Kept in this browser until the server confirms it.
    expect(readPendingAnswers("u1", "a1")).toEqual([{ questionId: "q1", answer: text("um dois"), baseRevision: 3 }]);
    await act(async () => vi.advanceTimersByTime(1));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe("/api/me/activities/a1/attempt/answers");
    expect(fetchMock.mock.calls[0]![1]?.method).toBe("PUT");
    expect(sentBodies()).toEqual([{ answers: [{ questionId: "q1", answer: text("um dois"), baseRevision: 3 }] }]);
    expect(result.current.saveState).toBe("saved");
    expect(result.current.pendingCount).toBe(0);
    expect(readPendingAnswers("u1", "a1")).toEqual([]);

    // The next change carries the new revision.
    act(() => result.current.setAnswer("q1", text("três")));
    await act(async () => result.current.flush());
    expect(sentBodies()[1].answers[0].baseRevision).toBe(4);
  });

  it("salva ao trocar de questão (flush) e quando a página fica oculta", async () => {
    fetchMock.mockResolvedValue(reply(200, saved(["q2", 1])));
    const { result } = setup([]);
    act(() => result.current.setAnswer("q2", { kind: "ALTERNATIVE", alternativeId: "alt" }));
    await act(async () => result.current.flush());
    expect(fetchMock).toHaveBeenCalledOnce();

    act(() => result.current.setAnswer("q2", { kind: "ALTERNATIVE", alternativeId: null }));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("012/US3-6 falha ao salvar mantém a tela; \"Tentar novamente\" reenvia o conteúdo intacto", async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { statusCode: 500, code: "INTERNAL_ERROR", message: "x" }));
    const { result } = setup();
    act(() => result.current.setAnswer("q1", text("não perca isto")));
    await act(async () => result.current.flush());
    expect(result.current.saveState).toBe("error");
    expect(result.current.error?.code).toBe("INTERNAL_ERROR");
    expect(result.current.answerOf("q1")).toEqual(text("não perca isto"));
    expect(readPendingAnswers("u1", "a1")).toHaveLength(1);

    fetchMock.mockResolvedValueOnce(reply(200, saved(["q1", 4])));
    await act(async () => result.current.retry());
    expect(sentBodies()[1]).toEqual(sentBodies()[0]);
    expect(result.current.saveState).toBe("saved");
    expect(result.current.error).toBeNull();
  });

  it("012/US3-5 012/SC-005 sem conexão: avisa, guarda no navegador e envia quando a conexão volta, sem duplicar", async () => {
    const { result } = setup();
    act(() => setOnline(false));
    expect(result.current.offline).toBe(true);
    act(() => result.current.setAnswer("q1", text("escrito offline")));
    await act(async () => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(readPendingAnswers("u1", "a1")).toEqual([{ questionId: "q1", answer: text("escrito offline"), baseRevision: 3 }]);

    fetchMock.mockResolvedValue(reply(200, saved(["q1", 4])));
    await act(async () => setOnline(true));
    expect(result.current.offline).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.current.saveState).toBe("saved");
    expect(readPendingAnswers("u1", "a1")).toEqual([]);
  });

  it("queda no meio do envio (fetch rejeita) marca sem conexão e mantém a resposta", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = setup();
    act(() => result.current.setAnswer("q1", text("quase")));
    await act(async () => result.current.flush());
    expect(result.current.offline).toBe(true);
    expect(result.current.saveState).toBe("error");
    expect(readPendingAnswers("u1", "a1")).toHaveLength(1);
  });

  it("012/SC-005 ao carregar, reenvia o que este navegador guardou (recarga, aba fechada)", async () => {
    writePendingAnswers("u1", "a1", [{ questionId: "q1", answer: text("antes de recarregar"), baseRevision: 3 }]);
    fetchMock.mockResolvedValue(reply(200, saved(["q1", 4])));
    const { result } = setup();
    expect(result.current.answerOf("q1")).toEqual(text("antes de recarregar"));
    await act(async () => undefined);
    expect(sentBodies()).toEqual([{ answers: [{ questionId: "q1", answer: text("antes de recarregar"), baseRevision: 3 }] }]);
    expect(result.current.pendingCount).toBe(0);
  });

  it("CONFLICT substitui a cópia local pela do servidor e avisa", async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        savedAt: "2026-10-01T12:00:00.000Z",
        results: [{ questionId: "q1", outcome: "CONFLICT", revision: 5, answer: text("da outra aba") }],
      }),
    );
    const { result } = setup();
    act(() => result.current.setAnswer("q1", text("desta aba")));
    await act(async () => result.current.flush());
    expect(result.current.answerOf("q1")).toEqual(text("da outra aba"));
    expect(result.current.conflict).toBe(true);
    expect(result.current.pendingCount).toBe(0);
    expect(readPendingAnswers("u1", "a1")).toEqual([]);
    act(() => result.current.dismissConflict());
    expect(result.current.conflict).toBe(false);

    // The next edit starts from the server's revision.
    fetchMock.mockResolvedValue(reply(200, saved(["q1", 6])));
    act(() => result.current.setAnswer("q1", text("depois do conflito")));
    await act(async () => result.current.flush());
    expect(sentBodies()[1].answers[0].baseRevision).toBe(5);
  });

  it("mudança durante um envio é enviada logo depois, sem perder a última versão", async () => {
    let resolveFirst: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    fetchMock.mockResolvedValueOnce(reply(200, saved(["q1", 5])));
    const { result } = setup();
    act(() => result.current.setAnswer("q1", text("primeira")));
    act(() => result.current.flush());
    expect(result.current.saveState).toBe("saving");
    act(() => result.current.setAnswer("q1", text("segunda")));
    act(() => result.current.flush());
    await act(async () => resolveFirst(reply(200, saved(["q1", 4]))));
    expect(sentBodies().map((body) => body.answers[0].answer.text)).toEqual(["primeira", "segunda"]);
    expect(sentBodies()[1].answers[0].baseRevision).toBe(4);
    expect(result.current.answerOf("q1")).toEqual(text("segunda"));
    expect(result.current.pendingCount).toBe(0);
  });
});
