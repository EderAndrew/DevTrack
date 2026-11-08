import { useQuery } from "@tanstack/react-query";
import { getAttemptTimeline } from "../api/exam-room";
import { useLivePolling } from "./use-live-polling";

/** A student's occurrences (024/US2-4): the 018 timeline of the attempt, refreshed like the room. */
export function useStudentOccurrences(classId: string, activityId: string, attemptId: string) {
  const interval = useLivePolling();
  return useQuery({
    queryKey: ["attempt-timeline", classId, activityId, attemptId],
    queryFn: () => getAttemptTimeline(classId, activityId, attemptId),
    refetchInterval: interval,
  });
}
