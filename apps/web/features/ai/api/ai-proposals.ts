import type { AiProposalListQuery, AiProposalPage, AiProposalView, DecideAiProposalRequest } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const listQuery = (query: AiProposalListQuery) => {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const text = params.toString();
  return text ? `?${text}` : "";
};

/** The session teacher's proposals of L2 agents (006 contracts/http-api.md). */
export const aiProposalsApi = {
  list: (query: AiProposalListQuery = {}) => apiClient.get<AiProposalPage>(`/ai/proposals${listQuery(query)}`),
  get: (id: string) => apiClient.get<AiProposalView>(`/ai/proposals/${id}`),
  decide: (id: string, body: DecideAiProposalRequest) => apiClient.post<AiProposalView>(`/ai/proposals/${id}/decision`, body),
};
