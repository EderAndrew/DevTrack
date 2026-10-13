"use client";

import type { StartAttemptRequest, SubmitAttemptRequest } from "@repo/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ATTENDANCE_POLL_MS } from "@/features/attendance/schemas/attendance";
import { integrityApi } from "@/features/controlled-attempt/api/integrity";
import { isOffline, type StudentActivityListFilters, studentActivitiesApi } from "../api/student-activities";

export { isOffline };

/** Query keys: `["student-activities", …]`. */
export const studentActivitiesKeys = {
  all: ["student-activities"] as const,
  dashboard: () => [...studentActivitiesKeys.all, "dashboard"] as const,
  list: (filters: StudentActivityListFilters) => [...studentActivitiesKeys.all, "list", filters.status, filters.type] as const,
  detail: (activityId: string) => [...studentActivitiesKeys.all, "detail", activityId] as const,
  attempt: (activityId: string, number: number) => [...studentActivitiesKeys.all, "attempt", activityId, number] as const,
  integrity: (activityId: string) => [...studentActivitiesKeys.all, "integrity", activityId] as const,
};

/**
 * 016/FR-009 (research M8): a work appears as soon as the teacher marks the student present, so the
 * dashboard and the list are read again every 5 s, never while the page is hidden.
 */
const POLL_WHILE_VISIBLE = { refetchInterval: ATTENDANCE_POLL_MS, refetchIntervalInBackground: false } as const;

export const useStudentDashboard = () =>
  useQuery({ queryKey: studentActivitiesKeys.dashboard(), queryFn: studentActivitiesApi.dashboard, ...POLL_WHILE_VISIBLE });

/** "Minhas atividades", page by page ("Carregar mais"). */
export const useStudentActivities = (filters: StudentActivityListFilters) =>
  useInfiniteQuery({
    queryKey: studentActivitiesKeys.list(filters),
    queryFn: ({ pageParam }) => studentActivitiesApi.list(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    ...POLL_WHILE_VISIBLE,
  });

/** One activity as the student sees it, with their attempt (012 US3). */
export const useStudentActivity = (activityId: string) =>
  useQuery({ queryKey: studentActivitiesKeys.detail(activityId), queryFn: () => studentActivitiesApi.get(activityId) });

/** The student's own records of a CONTROLLED attempt, read after the submission (015/US5, FR-027). */
export const useOwnIntegrity = (activityId: string, enabled: boolean) =>
  useQuery({ queryKey: studentActivitiesKeys.integrity(activityId), queryFn: () => integrityApi.own(activityId), enabled });

/** "Iniciar atividade": the answer is the activity with the attempt; the lists change status. */
export function useStartAttempt(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: StartAttemptRequest) => studentActivitiesApi.start(activityId, body),
    onSuccess: (activity) => {
      queryClient.setQueryData(studentActivitiesKeys.detail(activityId), activity);
      void queryClient.invalidateQueries({ queryKey: studentActivitiesKeys.all, refetchType: "none" });
    },
  });
}

/** Repeats after a dropped connection: the same idempotent call returns the same submission (FR-025). */
const SUBMIT_RETRIES = 3;

/** "Entregar atividade": the answer is the activity with its submission, read-only from now on. */
export function useSubmitAttempt(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitAttemptRequest) => studentActivitiesApi.submit(activityId, body),
    retry: (failures, error) => isOffline(error) && failures < SUBMIT_RETRIES,
    retryDelay: 1_000,
    onSuccess: (activity) => {
      queryClient.setQueryData(studentActivitiesKeys.detail(activityId), activity);
      void queryClient.invalidateQueries({ queryKey: studentActivitiesKeys.all, refetchType: "none" });
    },
  });
}

/** "Concluir exercícios" (013/FR-007): idempotent, so a dropped connection is retried like the submission. */
export function useCompleteAttempt(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ number, body }: { number: number; body: SubmitAttemptRequest }) => studentActivitiesApi.complete(activityId, number, body),
    retry: (failures, error) => isOffline(error) && failures < SUBMIT_RETRIES,
    retryDelay: 1_000,
    onSuccess: (activity) => {
      queryClient.setQueryData(studentActivitiesKeys.detail(activityId), activity);
      void queryClient.invalidateQueries({ queryKey: studentActivitiesKeys.all, refetchType: "none" });
    },
  });
}

/** "Refazer" (013/FR-005): names the attempt it follows, so a double click opens one attempt. */
export function useRetryAttempt(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (afterNumber: number) => studentActivitiesApi.retry(activityId, afterNumber),
    onSuccess: (activity) => {
      queryClient.setQueryData(studentActivitiesKeys.detail(activityId), activity);
      void queryClient.invalidateQueries({ queryKey: studentActivitiesKeys.all, refetchType: "none" });
    },
  });
}

/** An earlier concluded attempt, read only when the student picks it (013/FR-012). */
export const useExerciseAttempt = (activityId: string, number: number | null) =>
  useQuery({
    queryKey: studentActivitiesKeys.attempt(activityId, number ?? 0),
    queryFn: () => studentActivitiesApi.attempt(activityId, number!),
    enabled: number !== null,
  });
