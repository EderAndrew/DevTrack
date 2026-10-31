"use client";

import type { AddGroupMembersRequest } from "@repo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { studentActivitiesKeys } from "@/features/student-activities/hooks/use-student-activities";
import { groupWorkApi } from "../api/group-work-api";
import { groupWorkKeys } from "./use-group-candidates";

/**
 * FR-016: "Incluir integrantes". The answer is the activity with the new members and slots, so the bar
 * updates at once; the candidate list is read again on the next opening.
 */
export function useAddMembers(activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AddGroupMembersRequest) => groupWorkApi.addMembers(activityId, body),
    onSuccess: (activity) => {
      queryClient.setQueryData(studentActivitiesKeys.detail(activityId), activity);
      void queryClient.invalidateQueries({ queryKey: studentActivitiesKeys.all, refetchType: "none" });
      void queryClient.invalidateQueries({ queryKey: groupWorkKeys.candidates(activityId), refetchType: "none" });
    },
  });
}
