"use client";

import type { SyllabusProcessingStatus } from "@repo/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AI_POLL_MS } from "@/features/ai/hooks/use-ai-execution";
import { syllabusKeys } from "@/features/syllabus/hooks/use-syllabus-documents";
import { curriculumAiApi } from "../api/curriculum-ai";

/** `["syllabus-documents", id, "ai"]`, under the document. */
export const curriculumAiKeys = {
  status: (documentId: string) => [...syllabusKeys.document(documentId), "ai"] as const,
};

/**
 * What "Preencher com IA" can do on a document (007 research C14); refreshed every 2 s while an
 * analysis is active, so the stage, and then the proposal, show up without a reload. Given the
 * document's `processingStatus` (polled by the document page), it is also refreshed when that
 * changes, so a just-uploaded document becomes available once it is processed.
 */
export function useCurriculumAiStatus(documentId: string, processingStatus?: SyllabusProcessingStatus) {
  const query = useQuery({
    queryKey: curriculumAiKeys.status(documentId),
    queryFn: () => curriculumAiApi.getStatus(documentId),
    refetchInterval: (current) => (current.state.data?.activeExecution ? AI_POLL_MS : false),
  });
  const seen = useRef(processingStatus);
  const { refetch } = query;
  useEffect(() => {
    if (seen.current === processingStatus) return;
    seen.current = processingStatus;
    void refetch();
  }, [processingStatus, refetch]);
  return query;
}
