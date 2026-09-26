"use client";

import { type CurriculumProposalContent, CurriculumProposalContentSchema } from "@repo/contracts";
import { useAiProposal } from "@/features/ai/hooks/use-ai-proposal";

/**
 * A `CURRICULUM_EXTRACTION` proposal (006 `useAiProposal`) with its content parsed by the 007
 * schema. `content` is null when the proposal is of another type or its payload doesn't parse:
 * the page then shows it can't be reviewed, and never renders an unknown payload.
 */
export function useCurriculumProposal(proposalId: string) {
  const query = useAiProposal(proposalId);
  let content: CurriculumProposalContent | null = null;
  if (query.data?.proposalType === "CURRICULUM_EXTRACTION") {
    const parsed = CurriculumProposalContentSchema.safeParse(query.data.content);
    content = parsed.success ? parsed.data : null;
  }
  return { ...query, content };
}
