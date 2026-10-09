"use client";

import type { AttendanceBatch, Room } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { attendanceApi } from "../api/attendance";
import { ATTENDANCE_POLL_MS } from "../schemas/attendance";

/** Query keys: `["attendance", classId, activityId]`. */
export const attendanceKeys = {
  room: (classId: string, activityId: string) => ["attendance", classId, activityId] as const,
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

/** One batch; the answer is the room after it, and the activity's counts change ("n de m presentes"). */
export function useApplyAttendance(classId: string, activityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (batch: AttendanceBatch) => attendanceApi.apply(classId, activityId, batch),
    onSuccess: (room: Room) => {
      queryClient.setQueryData(attendanceKeys.room(classId, activityId), room);
      void queryClient.invalidateQueries({ queryKey: ["activities", classId] });
    },
  });
}
