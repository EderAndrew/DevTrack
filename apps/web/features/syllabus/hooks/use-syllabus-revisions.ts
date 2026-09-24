"use client";

import type { CreateSyllabusRevisionRequest, SaveSyllabusRevisionRequest, SyllabusRevisionView } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subjectsKeys } from "@/features/subjects/hooks/use-subjects";
import { syllabusRevisionsApi } from "../api/syllabus-revisions";
import { syllabusKeys } from "./use-syllabus-documents";

export const syllabusRevisionKeys = {
  revision: (id: string) => ["syllabus-revisions", id] as const,
};

export const useSyllabusRevision = (id: string | null) =>
  useQuery({
    queryKey: syllabusRevisionKeys.revision(id ?? ""),
    queryFn: () => syllabusRevisionsApi.get(id!),
    enabled: id !== null,
  });

/**
 * Keeps the revision just answered by the API and refreshes its document (draft and confirmed
 * revision) and the subject's versions list.
 */
function useAfterChange(subjectId: string) {
  const queryClient = useQueryClient();
  return async (revision: SyllabusRevisionView) => {
    queryClient.setQueryData(syllabusRevisionKeys.revision(revision.id), revision);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: syllabusKeys.document(revision.documentId) }),
      queryClient.invalidateQueries({ queryKey: subjectsKeys.detail(subjectId) }),
    ]);
  };
}

/** "Revisar conteúdo" (EXTRACTION), "Preencher manualmente" (MANUAL) or "Nova revisão" (REVISION). */
export function useCreateSyllabusRevision(subjectId: string, documentId: string) {
  const afterChange = useAfterChange(subjectId);
  return useMutation({
    mutationFn: (body: CreateSyllabusRevisionRequest) => syllabusRevisionsApi.create(documentId, body),
    onSuccess: afterChange,
  });
}

export function useSaveSyllabusRevision(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveSyllabusRevisionRequest) => syllabusRevisionsApi.save(id, body),
    onSuccess: (revision) => queryClient.setQueryData(syllabusRevisionKeys.revision(revision.id), revision),
  });
}

export function useConfirmSyllabusRevision(subjectId: string, id: string) {
  const afterChange = useAfterChange(subjectId);
  return useMutation({ mutationFn: () => syllabusRevisionsApi.confirm(id), onSuccess: afterChange });
}
