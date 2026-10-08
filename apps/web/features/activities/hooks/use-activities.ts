"use client";

import type {
  ActivitySource,
  CreateActivityRequest,
  GradeSubmissionRequest,
  MarkExerciseResultsRequest,
  TeacherActivity,
  TeacherAttempt,
  UpdateActivityRequest,
} from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activitiesApi, activitySourcesApi, attemptsApi, isActivityVersionConflict, isSubmissionVersionConflict } from "../api/activities";

export { isActivityVersionConflict, isSubmissionVersionConflict };

/** Query keys: `["activities", classId, …]`. */
export const activitiesKeys = {
  all: ["activities"] as const,
  class: (classId: string) => [...activitiesKeys.all, classId] as const,
  detail: (classId: string, activityId: string) => [...activitiesKeys.class(classId), activityId] as const,
  attempt: (classId: string, activityId: string, attemptId: string) =>
    [...activitiesKeys.detail(classId, activityId), "attempts", attemptId] as const,
  works: (subjectId: string) => ["activities", "sources", "works", subjectId] as const,
  helpAvailability: ["activities", "help-availability"] as const,
  exercises: (query: string) => ["activities", "sources", "exercises", query] as const,
};

export const useClassActivities = (classId: string) =>
  useQuery({ queryKey: activitiesKeys.class(classId), queryFn: () => activitiesApi.list(classId) });

export const useActivity = (classId: string, activityId: string) =>
  useQuery({ queryKey: activitiesKeys.detail(classId, activityId), queryFn: () => activitiesApi.get(classId, activityId) });

/** The approved works of the class's subject (none without a subject). */
export const useApprovedWorks = (subjectId: string | null) =>
  useQuery({
    queryKey: activitiesKeys.works(subjectId ?? ""),
    queryFn: () => activitySourcesApi.works(subjectId!),
    enabled: subjectId !== null,
  });

export const useApprovedExercises = (query: string) =>
  useQuery({ queryKey: activitiesKeys.exercises(query), queryFn: () => activitySourcesApi.exercises(query) });

/** Whether the AI help can be turned on (015/FR-004); asked only by a Trabalho's forms. */
export const useHelpAvailability = (enabled: boolean) =>
  useQuery({ queryKey: activitiesKeys.helpAvailability, queryFn: () => activitiesApi.helpAvailability(), enabled });

export const useScopeCheck = (classId: string) =>
  useMutation({ mutationFn: (source: ActivitySource) => activitiesApi.scopeCheck(classId, source) });

/** After a write: the returned activity is cached and the class's list is stale. */
function useAfterChange(classId: string) {
  const queryClient = useQueryClient();
  return async (activity: TeacherActivity) => {
    queryClient.setQueryData(activitiesKeys.detail(classId, activity.id), activity);
    await queryClient.invalidateQueries({ queryKey: activitiesKeys.class(classId), exact: true });
  };
}

export function useCreateActivity(classId: string) {
  const afterChange = useAfterChange(classId);
  return useMutation({ mutationFn: (body: CreateActivityRequest) => activitiesApi.create(classId, body), onSuccess: afterChange });
}

/** Edit (with the version read), close, cancel and release; `reload` reads the activity again after a conflict. */
export function useActivityActions(classId: string, activityId: string) {
  const queryClient = useQueryClient();
  const afterChange = useAfterChange(classId);
  return {
    update: useMutation({
      mutationFn: (body: UpdateActivityRequest) => activitiesApi.update(classId, activityId, body),
      onSuccess: afterChange,
    }),
    close: useMutation({ mutationFn: () => activitiesApi.close(classId, activityId), onSuccess: afterChange }),
    cancel: useMutation({ mutationFn: () => activitiesApi.cancel(classId, activityId), onSuccess: afterChange }),
    release: useMutation({ mutationFn: () => activitiesApi.release(classId, activityId), onSuccess: afterChange }),
    reload: () => queryClient.invalidateQueries({ queryKey: activitiesKeys.detail(classId, activityId) }),
  };
}

export const useAttempt = (classId: string, activityId: string, attemptId: string) =>
  useQuery({
    queryKey: activitiesKeys.attempt(classId, activityId, attemptId),
    queryFn: () => attemptsApi.get(classId, activityId, attemptId),
  });

/**
 * Grade, accept and mark one attempt: the returned attempt is cached and the activity (roster, counts)
 * is stale; `reload` reads the attempt again after a version conflict.
 */
export function useAttemptActions(classId: string, activityId: string, attemptId: string) {
  const queryClient = useQueryClient();
  const afterChange = async (attempt: TeacherAttempt) => {
    queryClient.setQueryData(activitiesKeys.attempt(classId, activityId, attemptId), attempt);
    await queryClient.invalidateQueries({ queryKey: activitiesKeys.detail(classId, activityId), exact: true });
    await queryClient.invalidateQueries({ queryKey: activitiesKeys.class(classId), exact: true });
  };
  return {
    grade: useMutation({
      mutationFn: (body: GradeSubmissionRequest) => attemptsApi.grade(classId, activityId, attemptId, body),
      onSuccess: afterChange,
    }),
    accept: useMutation({ mutationFn: () => attemptsApi.accept(classId, activityId, attemptId), onSuccess: afterChange }),
    mark: useMutation({
      mutationFn: (body: MarkExerciseResultsRequest) => attemptsApi.mark(classId, activityId, attemptId, body),
      onSuccess: afterChange,
    }),
    reload: () => queryClient.invalidateQueries({ queryKey: activitiesKeys.attempt(classId, activityId, attemptId) }),
  };
}
