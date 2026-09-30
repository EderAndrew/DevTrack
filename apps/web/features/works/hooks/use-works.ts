"use client";

import type {
  CreateWorkRequest,
  UpdateWorkRequest,
  WorkGenerationRequest,
  WorkTeacherView,
} from "@repo/contracts";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { subjectsApi } from "@/features/subjects/api/subjects";
import { subjectsKeys } from "@/features/subjects/hooks/use-subjects";
import { syllabusDocumentsApi } from "@/features/syllabus/api/syllabus-documents";
import { syllabusKeys } from "@/features/syllabus/hooks/use-syllabus-documents";
import {
  isWorkVersionConflict,
  workGenerationApi,
  worksApi,
} from "../api/works";

export { isWorkVersionConflict };

export { useSyllabusRevision as useWorkRevision } from "@/features/syllabus/hooks/use-syllabus-revisions";

/** Query keys: `["works", …]`. */
export const worksKeys = {
  all: ["works"] as const,
  detail: (id: string) => [...worksKeys.all, id] as const,
  studentPreview: (id: string) =>
    [...worksKeys.all, id, "student-preview"] as const,
  languages: ["works", "programming-languages"] as const,
  generationAvailability: ["work-generation", "availability"] as const,
  generationRequests: ["work-generation-requests"] as const,
  generationRequest: (id: string) => ["work-generation-requests", id] as const,
};

/** How often a request still generating is read again. */
export const WORK_GENERATION_POLL_MS = 3000;

/** The catalog changes only by migration: cached for the session. */
export const useWorkLanguages = () =>
  useQuery({
    queryKey: worksKeys.languages,
    queryFn: worksApi.programmingLanguages,
    staleTime: Infinity,
  });

/** The work's subject: the teacher's active subjects (first page, ordered by name). */
export const useWorkSubjects = () =>
  // Not `subjectsKeys.list`: that key holds the list page's infinite query.
  useQuery({
    queryKey: [...subjectsKeys.all, "work-form"],
    queryFn: () => subjectsApi.list({ status: "ACTIVE" }),
  });

/** The subject's syllabus versions (the form keeps the confirmed ones). */
export const useWorkSyllabi = (subjectId: string) =>
  useQuery({
    queryKey: syllabusKeys.subjectDocuments(subjectId),
    queryFn: () => syllabusDocumentsApi.list(subjectId),
    enabled: subjectId !== "",
  });

export function useCreateWork() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateWorkRequest) => worksApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: worksKeys.all }),
  });
}

/** One of the teacher's works, everything included (the teacher view). */
export const useWork = (id: string) =>
  useQuery({ queryKey: worksKeys.detail(id), queryFn: () => worksApi.get(id) });

/**
 * "Salvar alterações" and "Aprovar" (US5): each answers the work as it now is, which replaces the
 * cached one; the bank and the student view are read again.
 */
export function useWorkActions(id: string) {
  const queryClient = useQueryClient();
  const onSuccess = (work: WorkTeacherView) => {
    queryClient.setQueryData(worksKeys.detail(id), work);
    void queryClient.invalidateQueries({
      queryKey: worksKeys.all,
      predicate: (query) =>
        query.queryKey[1] !== id || query.queryKey.length > 2,
    });
  };
  return {
    update: useMutation({
      mutationFn: (body: UpdateWorkRequest) => worksApi.update(id, body),
      onSuccess,
    }),
    approve: useMutation({
      mutationFn: (version: number) => worksApi.approve(id, version),
      onSuccess,
    }),
    /** A version conflict: the work is read again, as it now is. */
    reload: () =>
      queryClient.invalidateQueries({
        queryKey: worksKeys.detail(id),
        exact: true,
      }),
  };
}

/** The student view of one of the teacher's works, as the server builds it. */
export const useWorkStudentPreview = (id: string) =>
  useQuery({
    queryKey: worksKeys.studentPreview(id),
    queryFn: () => worksApi.studentPreview(id),
  });

/** Whether "Criar trabalho com IA" can take a request now (006 semantics, no reason text). */
export const useWorkGenerationAvailability = () =>
  useQuery({
    queryKey: worksKeys.generationAvailability,
    queryFn: workGenerationApi.availability,
  });

export function useRequestWorkGeneration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: WorkGenerationRequest) =>
      workGenerationApi.request(body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: worksKeys.generationRequests,
      }),
  });
}

/** The teacher's requests, newest first, page by page; refreshed while one is still generating. */
export const useWorkGenerationRequests = () =>
  useInfiniteQuery({
    queryKey: worksKeys.generationRequests,
    queryFn: ({ pageParam }) =>
      workGenerationApi.list({ cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) =>
        page.items.some((request) => request.status === "PENDING"),
      )
        ? WORK_GENERATION_POLL_MS
        : false,
  });

/** One request, polled while PENDING (contracts/web-ui.md). */
export const useWorkGenerationRequest = (id: string) =>
  useQuery({
    queryKey: worksKeys.generationRequest(id),
    queryFn: () => workGenerationApi.get(id),
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" ? WORK_GENERATION_POLL_MS : false,
  });
