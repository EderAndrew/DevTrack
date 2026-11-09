import { useQuery } from "@tanstack/react-query";
import { getExams } from "../../exam-list/api/exams";
import { EXAMS_QUERY_KEY } from "../../exam-list/hooks/use-exams";
import { getExamMonitor, isOffline, isRefused } from "../api/exam-room";
import { useLivePolling } from "./use-live-polling";

export const examMonitorKey = (classId: string, activityId: string) => ["exam-monitor", classId, activityId] as const;

/**
 * The room as last read, kept live for a screen inside it (025: a student's detail shows the bell, which changes
 * when a send makes the room be read again); no polling of its own: the cached room is kept until it is
 * invalidated, and read only when there is none.
 */
export function useExamMonitor(classId: string, activityId: string) {
  return useQuery({ queryKey: examMonitorKey(classId, activityId), queryFn: () => getExamMonitor(classId, activityId), staleTime: Infinity });
}

/**
 * The room of an exam (024/US2): the 018 monitor, refreshed every 5 s while visible, and the list of exams
 * in progress, so a closed or cancelled exam is said in words (US2-6). Without a connection the last room
 * stays on the screen with the time it was read (US2-7); the polling keeps trying.
 */
export function useExamRoom(classId: string, activityId: string) {
  const interval = useLivePolling();
  const monitor = useQuery({
    queryKey: examMonitorKey(classId, activityId),
    queryFn: () => getExamMonitor(classId, activityId),
    refetchInterval: interval,
  });
  const exams = useQuery({ queryKey: EXAMS_QUERY_KEY, queryFn: getExams, refetchInterval: interval });
  const exam = exams.data?.items.find((item) => item.activityId === activityId) ?? null;
  return {
    monitor,
    exam,
    closed: exams.isSuccess && exam === null,
    offline: isOffline(monitor.error),
    /** Refused by the API (404: no longer the teacher's room, FR-017). */
    lost: isRefused(monitor.error),
    updatedAt: monitor.dataUpdatedAt,
  };
}
