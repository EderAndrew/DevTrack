"use client";

import type { DecideAiProposalRequest } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { aiProposalsApi } from "../api/ai-proposals";
import { aiProposalKeys } from "./use-ai-proposal";

/**
 * The teacher's decision on a proposal (006/FR-043). The answer replaces the cached proposal and
 * the lists refresh; on 409 (decided elsewhere or expired) the proposal is fetched again, and the
 * screen shows `messageForError(error)` from the catalogue.
 */
export function useDecideAiProposal(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: DecideAiProposalRequest) => aiProposalsApi.decide(id, body),
    onSuccess: async (view) => {
      queryClient.setQueryData(aiProposalKeys.proposal(view.id), view);
      await queryClient.invalidateQueries({ queryKey: aiProposalKeys.lists() });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: aiProposalKeys.proposal(id) });
    },
  });
}
