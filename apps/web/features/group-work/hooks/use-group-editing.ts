"use client";

import type { GroupEditingRequest } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { studentActivitiesKeys } from "@/features/student-activities/hooks/use-student-activities";
import { groupWorkApi } from "../api/group-work-api";

/**
 * FR-013: passes, takes back or returns the editing. The answer is the activity with the new editor, so
 * this page switches between editing and reading at once; the other members see it on their next poll.
 */
export function useGroupEditing(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: GroupEditingRequest) => groupWorkApi.editing(activityId, body),
    onSuccess: (activity) => {
      queryClient.setQueryData(studentActivitiesKeys.detail(activityId), activity);
      void queryClient.invalidateQueries({ queryKey: studentActivitiesKeys.all, refetchType: "none" });
    },
  });
}
