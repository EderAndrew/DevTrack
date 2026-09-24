"use client";

import type { ClassPlanEnvelope, ClassPlanView, UpdateClassMeetingsRequest } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { classesKeys } from "@/features/classes/hooks/use-classes";
import { classMeetingsApi } from "../api/class-meetings";

/** `["classes", id, "meetings"]` and the class plan, `["classes", id, "plan"]` (004 contracts/web-ui.md). */
export const classMeetingsKeys = {
  meetings: (classId: string) => [...classesKeys.detail(classId), "meetings"] as const,
  plan: (classId: string) => [...classesKeys.detail(classId), "plan"] as const,
};

export const useClassMeetings = (classId: string) =>
  useQuery({ queryKey: classMeetingsKeys.meetings(classId), queryFn: () => classMeetingsApi.list(classId) });

/**
 * The plan already in the cache, if any: the calendar lists a meeting's topics from it before
 * saving (FR-029), without fetching anything else.
 */
export function useCachedClassPlan(classId: string): ClassPlanView | null {
  const queryClient = useQueryClient();
  return queryClient.getQueryData<ClassPlanEnvelope>(classMeetingsKeys.plan(classId))?.plan ?? null;
}

/** Saves the calendar; the plan shows meetings and topics, so it is stale afterwards. */
export function useUpdateClassMeetings(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateClassMeetingsRequest) => classMeetingsApi.update(classId, body),
    onSuccess: async (list) => {
      queryClient.setQueryData(classMeetingsKeys.meetings(classId), list);
      await queryClient.invalidateQueries({ queryKey: classMeetingsKeys.plan(classId) });
    },
  });
}
