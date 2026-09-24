"use client";

import type { SyllabusDocumentView, SyllabusProcessingStatus } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subjectsKeys } from "@/features/subjects/hooks/use-subjects";
import { syllabusDocumentsApi } from "../api/syllabus-documents";

/** How often a document still being processed is fetched again (research E17). */
export const SYLLABUS_POLL_MS = 2000;

const IN_PROGRESS: readonly SyllabusProcessingStatus[] = ["UPLOADED", "PROCESSING"];
export const isInProgress = (status: SyllabusProcessingStatus) => IN_PROGRESS.includes(status);

/** `["subjects", subjectId, "syllabus-documents"]` (under the subject) and `["syllabus-documents", id]`. */
export const syllabusKeys = {
  subjectDocuments: (subjectId: string) => [...subjectsKeys.detail(subjectId), "syllabus-documents"] as const,
  document: (id: string) => ["syllabus-documents", id] as const,
};

/** Versions of a subject's syllabus, newest first; refreshed every 2 s while one is being processed. */
export const useSubjectDocuments = (subjectId: string) =>
  useQuery({
    queryKey: syllabusKeys.subjectDocuments(subjectId),
    queryFn: () => syllabusDocumentsApi.list(subjectId),
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => isInProgress(item.processingStatus)) ? SYLLABUS_POLL_MS : false,
  });

/** One version with its extraction; refreshed every 2 s only while `UPLOADED` or `PROCESSING` (E17). */
export const useSyllabusDocument = (id: string) =>
  useQuery({
    queryKey: syllabusKeys.document(id),
    queryFn: () => syllabusDocumentsApi.get(id),
    refetchInterval: (query) => (query.state.data && isInProgress(query.state.data.processingStatus) ? SYLLABUS_POLL_MS : false),
  });

/** After an upload or a retry: the versions list, the subject (its document count) and the document. */
function useAfterChange(subjectId: string) {
  const queryClient = useQueryClient();
  return async (document: SyllabusDocumentView) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: subjectsKeys.detail(subjectId) }),
      queryClient.invalidateQueries({ queryKey: syllabusKeys.document(document.id) }),
    ]);
  };
}

export function useUploadSyllabus(subjectId: string) {
  const afterChange = useAfterChange(subjectId);
  return useMutation({
    mutationFn: ({ file, onProgress }: { file: File; onProgress?: (percent: number) => void }) =>
      syllabusDocumentsApi.upload(subjectId, file, onProgress),
    onSuccess: (result) => afterChange(result.document),
  });
}

export function useRetrySyllabus(subjectId: string) {
  const afterChange = useAfterChange(subjectId);
  return useMutation({ mutationFn: (id: string) => syllabusDocumentsApi.retry(id), onSuccess: afterChange });
}
