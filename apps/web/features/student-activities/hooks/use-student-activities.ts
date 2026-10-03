"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { isOffline, type StudentActivityListFilters, studentActivitiesApi } from "../api/student-activities";

export { isOffline };

/** Query keys: `["student-activities", …]`. */
export const studentActivitiesKeys = {
  all: ["student-activities"] as const,
  dashboard: () => [...studentActivitiesKeys.all, "dashboard"] as const,
  list: (filters: StudentActivityListFilters) => [...studentActivitiesKeys.all, "list", filters.status, filters.type] as const,
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
