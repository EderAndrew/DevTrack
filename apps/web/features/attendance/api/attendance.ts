import type { AttendanceBatch, Room } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const attendancePath = (classId: string, activityId: string) => `/classes/${classId}/activities/${activityId}/attendance`;

/** The attendance of a work, teacher side (016 contracts/http-api.md, "Teacher routes"). */
export const attendanceApi = {
  room: (classId: string, activityId: string) => apiClient.get<Room>(attendancePath(classId, activityId)),
  /** Only the differences: who to mark (release the work to) and who to unmark (research M5). */
  apply: (classId: string, activityId: string, batch: AttendanceBatch) => apiClient.post<Room>(attendancePath(classId, activityId), batch),
};
