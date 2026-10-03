"use client";

import type { ActivitySource, CreateActivityRequest, TeacherActivity, UpdateActivityRequest } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activitiesApi, activitySourcesApi, isActivityVersionConflict } from "../api/activities";

export { isActivityVersionConflict };

/** Query keys: `["activities", classId, …]`. */
export const activitiesKeys = {
  all: ["activities"] as const,
  class: (classId: string) => [...activitiesKeys.all, classId] as const,
  detail: (classId: string, activityId: string) => [...activitiesKeys.class(classId), activityId] as const,
  works: (subjectId: string) => ["activities", "sources", "works", subjectId] as const,
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

/** Edit (with the version read), close and cancel; `reload` reads the activity again after a conflict. */
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
    reload: () => queryClient.invalidateQueries({ queryKey: activitiesKeys.detail(classId, activityId) }),
  };
}
