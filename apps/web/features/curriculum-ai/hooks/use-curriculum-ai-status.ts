"use client";

import { useQuery } from "@tanstack/react-query";
import { AI_POLL_MS } from "@/features/ai/hooks/use-ai-execution";
import { syllabusKeys } from "@/features/syllabus/hooks/use-syllabus-documents";
import { curriculumAiApi } from "../api/curriculum-ai";

/** `["syllabus-documents", id, "ai"]`, under the document. */
export const curriculumAiKeys = {
  status: (documentId: string) => [...syllabusKeys.document(documentId), "ai"] as const,
};

/**
 * What "Preencher com IA" can do on a document (007 research C14); refreshed every 2 s while an
 * analysis is active, so the stage, and then the proposal, show up without a reload.
 */
export const useCurriculumAiStatus = (documentId: string) =>
  useQuery({
    queryKey: curriculumAiKeys.status(documentId),
    queryFn: () => curriculumAiApi.getStatus(documentId),
    refetchInterval: (query) => (query.state.data?.activeExecution ? AI_POLL_MS : false),
  });
