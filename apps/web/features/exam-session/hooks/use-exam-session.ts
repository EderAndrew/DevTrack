"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { pausesApi } from "@/features/attendance/api/attendance";
import { ATTENDANCE_POLL_MS } from "@/features/attendance/schemas/attendance";
import { examSessionApi, type HoldDecision } from "../api/exam-session";

/** Query keys: `["exam-session", classId, activityId, …]`. */
export const examSessionKeys = {
  monitor: (classId: string, activityId: string) => ["exam-session", classId, activityId] as const,
  occurrences: (classId: string, activityId: string, attemptId: string) => ["exam-session", classId, activityId, "occurrences", attemptId] as const,
};

/** The monitor, polled every 5 s while the page is visible (018/FR-025, SC-007); no WebSocket. */
export const useExamMonitor = (classId: string, activityId: string) =>
  useQuery({
    queryKey: examSessionKeys.monitor(classId, activityId),
    queryFn: () => examSessionApi.monitor(classId, activityId),
    refetchInterval: ATTENDANCE_POLL_MS,
    refetchIntervalInBackground: false,
  });

/** One attempt's counted occurrences, read when the teacher opens "Ver ocorrências". */
export const useOccurrences = (classId: string, activityId: string, attemptId: string) =>
  useQuery({
    queryKey: examSessionKeys.occurrences(classId, activityId, attemptId),
    queryFn: () => examSessionApi.occurrences(classId, activityId, attemptId),
  });

/**
 * The monitor's writes — a decision on a hold, "Pausar aluno", "Liberar retorno" — each followed by a
 * new read of the monitor and of the activity (its pending decisions and roster).
 */
export function useExamRoomActions(classId: string, activityId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: examSessionKeys.monitor(classId, activityId) });
    void queryClient.invalidateQueries({ queryKey: ["activities", classId] });
  };
  return {
    decide: useMutation({
      mutationFn: ({ holdId, decision }: { holdId: string; decision: HoldDecision }) => examSessionApi.decide(classId, activityId, holdId, decision),
      onSettled: refresh,
    }),
    pause: useMutation({ mutationFn: (studentUserId: string) => pausesApi.pauseStudent(classId, activityId, studentUserId), onSettled: refresh }),
    release: useMutation({ mutationFn: (pauseId: string) => pausesApi.release(classId, activityId, pauseId), onSettled: refresh }),
  };
}
