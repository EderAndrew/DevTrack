"use client";

import type { AiProposalListQuery } from "@repo/contracts";
import { useQuery } from "@tanstack/react-query";
import { aiProposalsApi } from "../api/ai-proposals";

/** `["ai", "proposals", "list", query]` for lists and `["ai", "proposals", id]` for one proposal. */
export const aiProposalKeys = {
  list: (query: AiProposalListQuery = {}) => ["ai", "proposals", "list", query] as const,
  lists: () => ["ai", "proposals", "list"] as const,
  proposal: (id: string) => ["ai", "proposals", id] as const,
};

/** One proposal with its content, for the teacher's review. */
export const useAiProposal = (id: string | null) =>
  useQuery({ queryKey: aiProposalKeys.proposal(id ?? ""), queryFn: () => aiProposalsApi.get(id!), enabled: id !== null });

export const useAiProposals = (query: AiProposalListQuery = {}) =>
  useQuery({ queryKey: aiProposalKeys.list(query), queryFn: () => aiProposalsApi.list(query) });
