"use client";

import { useQuery } from "@tanstack/react-query";
import { groupWorkApi } from "../api/group-work-api";

export const groupWorkKeys = {
  all: ["group-work"] as const,
  candidates: (activityId: string) => [...groupWorkKeys.all, "candidates", activityId] as const,
};

/** The eligible classmates while the start dialog is open; always read again on opening (FR-005). */
export const useGroupCandidates = (activityId: string, enabled: boolean) =>
  useQuery({
    queryKey: groupWorkKeys.candidates(activityId),
    queryFn: () => groupWorkApi.candidates(activityId),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });
