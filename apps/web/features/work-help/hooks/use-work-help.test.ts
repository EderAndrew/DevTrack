import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTestQueryClient } from "../../../test/render";
import { json } from "@/features/student-activities/components/test-fixtures";
import { helpItem, helpState } from "../components/test-fixtures";
import { HELP_POLL_MS, HELP_WAIT_MS, useRequestHelp, useWorkHelp } from "./use-work-help";

const ACTIVITY = "bbbbbbbb-0000-4000-8000-000000000001";
const HELP = `/api/me/activities/${ACTIVITY}/attempt/help`;
const createQueryWrapper = () => {
  const client = makeTestQueryClient();
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
};
const pending = helpItem({ status: "REQUESTED", message: null, resolvedAt: null });

describe("015/US3-9 estado das ajudas: consulta enquanto pendente, até 60 s", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("pendente → consulta a cada 1,5 s até a orientação chegar; depois para", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const answers = [helpState({ pending: true, items: [pending] }), helpState({ pending: true, items: [pending] }), helpState({ used: 1, items: [helpItem()] })];
    const fetchMock = vi.fn(async () => json(200, answers.shift() ?? helpState({ used: 1, items: [helpItem()] })));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWorkHelp(ACTIVITY, true), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data?.pending).toBe(true));
    await act(async () => vi.advanceTimersByTimeAsync(HELP_POLL_MS * 2 + 10));
    await waitFor(() => expect(result.current.data?.used).toBe(1));
    const calls = fetchMock.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(HELP_POLL_MS * 4));
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(result.current.waitExpired).toBe(false);
  });

  it("passados 60 s ainda pendente: para de consultar e marca a espera como esgotada", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn(async () => json(200, helpState({ pending: true, items: [pending] })));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useWorkHelp(ACTIVITY, true), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data?.pending).toBe(true));
    await act(async () => vi.advanceTimersByTimeAsync(HELP_WAIT_MS + 10));
    await waitFor(() => expect(result.current.waitExpired).toBe(true));
    const calls = fetchMock.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(HELP_POLL_MS * 4));
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("enviar: o pedido pendente entra no estado e o corpo leva a questão, a pergunta e a chave", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        if (init?.method === "POST" && String(input) === HELP) {
          bodies.push(JSON.parse(String(init.body)));
          return json(202, pending);
        }
        return json(200, bodies.length === 0 ? helpState() : helpState({ pending: true, items: [pending] }));
      }),
    );
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => ({ state: useWorkHelp(ACTIVITY, true), request: useRequestHelp(ACTIVITY) }), { wrapper });
    await waitFor(() => expect(result.current.state.data).toBeTruthy());
    await act(async () => {
      await result.current.request.mutateAsync({ questionId: pending.questionId, question: "Por onde começo?", idempotencyKey: "eeeeeeee-0000-4000-8000-000000000001" });
    });
    expect(bodies).toEqual([{ questionId: pending.questionId, question: "Por onde começo?", idempotencyKey: "eeeeeeee-0000-4000-8000-000000000001" }]);
    await waitFor(() => expect(result.current.state.data?.items).toEqual([pending]));
  });
});
