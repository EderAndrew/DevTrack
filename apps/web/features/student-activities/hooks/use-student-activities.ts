"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isOffline, type StudentActivityListFilters, studentActivitiesApi } from "../api/student-activities";

export { isOffline };

/** Query keys: `["student-activities", …]`. */
export const studentActivitiesKeys = {
  all: ["student-activities"] as const,
  dashboard: () => [...studentActivitiesKeys.all, "dashboard"] as const,
  list: (filters: StudentActivityListFilters) => [...studentActivitiesKeys.all, "list", filters.status, filters.type] as const,
  detail: (activityId: string) => [...studentActivitiesKeys.all, "detail", activityId] as const,
};

export const useStudentDashboard = () =>
  useQuery({ queryKey: studentActivitiesKeys.dashboard(), queryFn: studentActivitiesApi.dashboard });

/** "Minhas atividades", page by page ("Carregar mais"). */
export const useStudentActivities = (filters: StudentActivityListFilters) =>
  useInfiniteQuery({
    queryKey: studentActivitiesKeys.list(filters),
    queryFn: ({ pageParam }) => studentActivitiesApi.list(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

/** One activity as the student sees it, with their attempt (012 US3). */
export const useStudentActivity = (activityId: string) =>
  useQuery({ queryKey: studentActivitiesKeys.detail(activityId), queryFn: () => studentActivitiesApi.get(activityId) });

/** "Iniciar atividade": the answer is the activity with the attempt; the lists change status. */
export function useStartAttempt(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => studentActivitiesApi.start(activityId),
    onSuccess: (activity) => {
      queryClient.setQueryData(studentActivitiesKeys.detail(activityId), activity);
      void queryClient.invalidateQueries({ queryKey: studentActivitiesKeys.all, refetchType: "none" });
    },
  });
}
