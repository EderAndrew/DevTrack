"use client";

import type { AttendanceBatch, Room } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attendanceApi, pausesApi } from "../api/attendance";
import { ATTENDANCE_POLL_MS } from "../schemas/attendance";

/** Query keys: `["attendance", classId, activityId]`. */
export const attendanceKeys = {
  room: (classId: string, activityId: string) => ["attendance", classId, activityId] as const,
  attemptPauses: (classId: string, activityId: string, attemptId: string) => ["attendance", classId, activityId, "pauses", attemptId] as const,
};

/** The room of a `PRESENT_ONLY` work, polled while the page is visible (FR-020, research M8). */
export const useRoom = (classId: string, activityId: string, enabled = true) =>
  useQuery({
    queryKey: attendanceKeys.room(classId, activityId),
    queryFn: () => attendanceApi.room(classId, activityId),
    enabled,
    refetchInterval: ATTENDANCE_POLL_MS,
    refetchIntervalInBackground: false,
  });

/**
 * One batch; the answer is the room after it, and the activity's counts change ("n de m presentes").
 * A refused batch (a student started meanwhile, 409 ATTENDANCE_STARTED) reads the room again.
 */
export function useApplyAttendance(classId: string, activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batch: AttendanceBatch) => attendanceApi.apply(classId, activityId, batch),
    onSuccess: (room: Room) => {
      queryClient.setQueryData(attendanceKeys.room(classId, activityId), room);
      void queryClient.invalidateQueries({ queryKey: ["activities", classId] });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: attendanceKeys.room(classId, activityId) }),
  });
}

/** An attempt's pauses for the review (FR-021), only for a `PRESENT_ONLY` work. */
export const useAttemptPauses = (classId: string, activityId: string, attemptId: string, enabled: boolean) =>
  useQuery({
    queryKey: attendanceKeys.attemptPauses(classId, activityId, attemptId),
    queryFn: () => pausesApi.ofAttempt(classId, activityId, attemptId),
    enabled,
  });

/** "Liberar retorno" (FR-014): the room is read again, the student's notice follows on its next poll. */
export function useReleasePause(classId: string, activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pauseId: string) => pausesApi.release(classId, activityId, pauseId),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: attendanceKeys.room(classId, activityId) }),
  });
}

/** "Pausar aluno" (FR-016): the room is read again, the student's page follows on its next poll. */
export function usePauseStudent(classId: string, activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (studentUserId: string) => pausesApi.pauseStudent(classId, activityId, studentUserId),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: attendanceKeys.room(classId, activityId) }),
  });
}
