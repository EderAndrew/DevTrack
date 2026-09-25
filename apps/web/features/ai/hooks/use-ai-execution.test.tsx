import type { AiExecutionView } from "@repo/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestQueryClient } from "../../../test/render";
import { AI_POLL_MS, aiKeys, useAiExecution } from "./use-ai-execution";
import { useCancelAiExecution } from "./use-cancel-ai-execution";
import { useRequestAiExecution } from "./use-request-ai-execution";

const ID = "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11";

const view = (status: AiExecutionView["status"]): AiExecutionView => ({
  id: ID,
  agent: { key: "reference-l1", name: "Referência", version: 1 },
  status,
  riskLevel: "L1_READ_ONLY",
  resource: null,
  errorCode: null,
  cancelRequested: false,
  proposalId: null,
  createdAt: "2026-09-25T12:00:00.000Z",
  startedAt: null,
  completedAt: null,
  failedAt: null,
  durationMs: null,
  transitions: [],
});

const reply = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
  });

describe("006/US1 hooks de execução de IA", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let queryClient = makeTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    queryClient = makeTestQueryClient();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("consulta a cada 2 s enquanto não chega a um estado final, e para nele", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock
      .mockResolvedValueOnce(reply(200, view("QUEUED")))
      .mockResolvedValueOnce(reply(200, view("RUNNING")))
      .mockImplementation(async () => reply(200, view("COMPLETED")));
    const { result } = renderHook(() => useAiExecution(ID), { wrapper });
    await waitFor(() => expect(result.current.data?.status).toBe("QUEUED"));
    expect(AI_POLL_MS).toBe(2000);

    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_MS));
    await waitFor(() => expect(result.current.data?.status).toBe("RUNNING"));
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_MS));
    await waitFor(() => expect(result.current.data?.status).toBe("COMPLETED"));

    const calls = fetchMock.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(AI_POLL_MS * 3));
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(String(fetchMock.mock.calls[0]![0])).toContain(`/api/ai/executions/${ID}`);
  });

  it("uma nova tentativa reusa a chave de idempotência; um novo pedido gera outra", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("rede caiu")).mockImplementation(async () => reply(202, view("QUEUED")));
    const { result } = renderHook(() => useRequestAiExecution(), { wrapper });
    const body = { agentKey: "reference-l1" };

    await act(async () => {
      await result.current.request(body).catch(() => undefined);
    });
    await act(async () => {
      await result.current.retry();
    });
    await act(async () => {
      await result.current.request(body);
    });

    const keys = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).idempotencyKey as string);
    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(queryClient.getQueryData(aiKeys.execution(ID))).toMatchObject({ status: "QUEUED" });
  });

  it("cancelar grava a resposta no cache e invalida a lista", async () => {
    fetchMock.mockResolvedValue(reply(200, view("CANCELLED")));
    queryClient.setQueryData(aiKeys.execution(ID), view("QUEUED"));
    queryClient.setQueryData(aiKeys.list(), { items: [], nextCursor: null });
    const { result } = renderHook(() => useCancelAiExecution(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(ID);
    });
    expect(queryClient.getQueryData<AiExecutionView>(aiKeys.execution(ID))?.status).toBe("CANCELLED");
    expect(queryClient.getQueryState(aiKeys.list())?.isInvalidated).toBe(true);
    expect(fetchMock.mock.calls[0]![1]?.method).toBe("POST");
  });
});
