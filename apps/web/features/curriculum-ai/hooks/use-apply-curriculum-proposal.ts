"use client";

import type { ApplyCurriculumProposalRequest } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { aiProposalKeys } from "@/features/ai/hooks/use-ai-proposal";
import { subjectsKeys } from "@/features/subjects/hooks/use-subjects";
import { syllabusKeys } from "@/features/syllabus/hooks/use-syllabus-documents";
import { syllabusRevisionKeys } from "@/features/syllabus/hooks/use-syllabus-revisions";
import { curriculumAiApi } from "../api/curriculum-ai";

/**
 * "Aplicar à ementa" (007/US3): keeps the draft and the decided proposal just answered, then
 * refreshes the document (its draft and the AI status under it), the subject's versions and the
 * proposal lists. On a 409 the proposal is fetched again (decided elsewhere or expired).
 */
export function useApplyCurriculumProposal(subjectId: string, documentId: string, proposalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplyCurriculumProposalRequest) => curriculumAiApi.applyProposal(documentId, proposalId, body),
    onSuccess: async ({ revision, proposal }) => {
      queryClient.setQueryData(syllabusRevisionKeys.revision(revision.id), revision);
      queryClient.setQueryData(aiProposalKeys.proposal(proposal.id), proposal);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: syllabusKeys.document(documentId) }),
        queryClient.invalidateQueries({ queryKey: subjectsKeys.detail(subjectId) }),
        queryClient.invalidateQueries({ queryKey: aiProposalKeys.lists() }),
      ]);
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: aiProposalKeys.proposal(proposalId) });
    },
  });
}
