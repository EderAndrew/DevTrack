import type { AiProposalView } from "@repo/contracts";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { messageForError } from "@/lib/messages/error-messages";
import { makeTestQueryClient } from "../../../test/render";
import { aiProposalKeys, useAiProposal } from "./use-ai-proposal";
import { useDecideAiProposal } from "./use-decide-ai-proposal";

const ID = "5b2d7c1e-3a4f-4c8e-9d0b-1a2b3c4d5e6f";

const proposal = (status: AiProposalView["status"]): AiProposalView => ({
  id: ID,
  executionId: "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11",
  agent: { key: "reference-l2", name: "Referência", version: 1 },
  proposalType: "REFERENCE_ITEMS",
  target: { type: "SUBJECT", id: null },
  status,
  nature: "SUGGESTION",
  itemIds: ["i1", "i2"],
  acceptedItemIds: null,
  expiresAt: "2026-10-25T12:00:00.000Z",
  decidedAt: status === "READY_FOR_REVIEW" ? null : "2026-09-25T12:00:00.000Z",
  decision: status === "READY_FOR_REVIEW" ? null : { nature: "HUMAN_DECISION", byUserId: "7c1e3a4f-5b2d-4c8e-9d0b-1a2b3c4d5e6f" },
  createdAt: "2026-09-25T11:00:00.000Z",
  content: { items: [] },
});

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("006/US5 hooks de proposta", () => {
  const fetchMock = vi.fn<typeof fetch>();
  let queryClient = makeTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    queryClient = makeTestQueryClient();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("decidir envia a decisão, troca a proposta em cache e invalida as listas", async () => {
    fetchMock.mockImplementation(async () => reply(200, proposal("APPROVED")));
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDecideAiProposal(ID), { wrapper });

    await act(() => result.current.mutateAsync({ decision: "APPROVE" }));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain(`/api/ai/proposals/${ID}/decision`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ decision: "APPROVE" });
    expect(queryClient.getQueryData(aiProposalKeys.proposal(ID))).toMatchObject({ status: "APPROVED" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: aiProposalKeys.lists() });
  });

  it("409 (decidida em outro lugar ou vencida) → mensagem do catálogo e a proposta é buscada de novo", async () => {
    fetchMock
      .mockResolvedValueOnce(reply(200, proposal("READY_FOR_REVIEW")))
      .mockResolvedValueOnce(reply(409, { statusCode: 409, code: "INVALID_STATE_TRANSITION", message: "texto da API" }))
      .mockImplementation(async () => reply(200, proposal("REJECTED")));
    const { result } = renderHook(() => ({ view: useAiProposal(ID), decide: useDecideAiProposal(ID) }), { wrapper });
    await waitFor(() => expect(result.current.view.data?.status).toBe("READY_FOR_REVIEW"));

    await act(async () => {
      await result.current.decide.mutateAsync({ decision: "APPROVE" }).catch(() => undefined);
    });

    await waitFor(() => expect(result.current.decide.error).not.toBeNull());
    expect(messageForError(result.current.decide.error)).toBe("Operação não permitida no estado atual.");
    expect(messageForError(result.current.decide.error)).not.toContain("texto da API");
    await waitFor(() => expect(result.current.view.data?.status).toBe("REJECTED"));
  });

  it("422 de itens inválidos → a mensagem do catálogo para AI_PROPOSAL_ITEMS_INVALID", async () => {
    fetchMock.mockImplementation(async () => reply(422, { statusCode: 422, code: "AI_PROPOSAL_ITEMS_INVALID", message: "x" }));
    const { result } = renderHook(() => useDecideAiProposal(ID), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ decision: "APPROVE_PARTIALLY", acceptedItemIds: ["i1", "i2"] }).catch(() => undefined);
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(messageForError(result.current.error)).toMatch(/^Selecione ao menos um item/);
  });
});
