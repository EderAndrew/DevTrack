"use client";

import type { CreateExerciseRequest, ExerciseBatchRequest, ExerciseSetRequest, UpdateExerciseRequest } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { subjectsApi } from "@/features/subjects/api/subjects";
import { subjectsKeys } from "@/features/subjects/hooks/use-subjects";
import { syllabusDocumentsApi } from "@/features/syllabus/api/syllabus-documents";
import { syllabusKeys } from "@/features/syllabus/hooks/use-syllabus-documents";
import { exerciseBatchesApi, exercisesApi, programmingLanguagesApi } from "../api/exercises";

export { useSyllabusRevision as useTopicRevision } from "@/features/syllabus/hooks/use-syllabus-revisions";

/** Query keys: `["exercises", …]` and `["programming-languages"]`. */
export const exercisesKeys = {
  all: ["exercises"] as const,
  detail: (id: string) => [...exercisesKeys.all, id] as const,
  languages: ["programming-languages"] as const,
  batches: ["exercise-batches"] as const,
  batch: (id: string) => [...exercisesKeys.batches, id] as const,
  availability: ["exercise-generation", "availability"] as const,
};

/** A batch still generating is looked at again every 3 s. */
export const BATCH_POLL_MS = 3000;

/** The catalog changes only by migration: cached for the session. */
export const useProgrammingLanguages = () =>
  useQuery({ queryKey: exercisesKeys.languages, queryFn: programmingLanguagesApi.list, staleTime: Infinity });

/** Topic picker, step 1: the teacher's active subjects (first page, ordered by name). */
export const useTopicSubjects = () =>
  // Not `subjectsKeys.list`: that key holds the list page's infinite query.
  useQuery({ queryKey: [...subjectsKeys.all, "topic-picker"], queryFn: () => subjectsApi.list({ status: "ACTIVE" }) });

/** Topic picker, step 2: the subject's syllabus versions (the picker keeps the confirmed ones). */
export const useTopicSyllabi = (subjectId: string) =>
  useQuery({
    queryKey: syllabusKeys.subjectDocuments(subjectId),
    queryFn: () => syllabusDocumentsApi.list(subjectId),
    enabled: subjectId !== "",
  });

/** Whether "Criar com IA" can take a request now (006 semantics, no reason text). */
export const useGenerationAvailability = () =>
  useQuery({ queryKey: exercisesKeys.availability, queryFn: exerciseBatchesApi.availability });

/** The teacher's batches, newest first, page by page; refreshed while one is still generating. */
export const useExerciseBatches = () =>
  useInfiniteQuery({
    queryKey: exercisesKeys.batches,
    queryFn: ({ pageParam }) => exerciseBatchesApi.list({ cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.items.some((batch) => batch.status === "PENDING")) ? BATCH_POLL_MS : false,
  });

export function useRequestExerciseBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExerciseBatchRequest) => exerciseBatchesApi.request(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exercisesKeys.batches }),
  });
}

export function useCreateExerciseSet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ExerciseSetRequest) => exercisesApi.createSet(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exercisesKeys.all }),
  });
}

export function useCreateExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateExerciseRequest) => exercisesApi.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: exercisesKeys.all }),
  });
}

/** One batch and its exercises; looked at again every 3 s while it is generating (US4). */
export const useExerciseBatch = (id: string) =>
  useQuery({
    queryKey: exercisesKeys.batch(id),
    queryFn: () => exerciseBatchesApi.get(id),
    refetchInterval: (query) => (query.state.data?.batch.status === "PENDING" ? BATCH_POLL_MS : false),
  });

/**
 * The review of a batch (010 US4): edit, approve one or several, delete a draft. Each change
 * refreshes the batch and the bank; a stale version comes back as `EXERCISE_VERSION_CONFLICT`.
 */
export function useBatchReview(batchId: string) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: exercisesKeys.batches }),
      queryClient.invalidateQueries({ queryKey: exercisesKeys.all }),
    ]);
  return {
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: UpdateExerciseRequest }) => exercisesApi.update(id, body),
      onSettled: refresh,
    }),
    approve: useMutation({
      mutationFn: ({ id, version }: { id: string; version: number }) => exercisesApi.approve(id, version),
      onSettled: refresh,
    }),
    approveMany: useMutation({
      mutationFn: (exerciseIds: string[]) => exerciseBatchesApi.approve(batchId, { exerciseIds }),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: ({ id, version }: { id: string; version: number }) => exercisesApi.remove(id, version),
      onSettled: refresh,
    }),
  };
}
