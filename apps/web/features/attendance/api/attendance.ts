import type { AttendanceBatch, DeclareExit, MyPause, Room, StudentPause, TeacherPause } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const attendancePath = (classId: string, activityId: string) => `/classes/${classId}/activities/${activityId}/attendance`;

/** The attendance of a work, teacher side (016 contracts/http-api.md, "Teacher routes"). */
export const attendanceApi = {
  room: (classId: string, activityId: string) => apiClient.get<Room>(attendancePath(classId, activityId)),
  /** Only the differences: who to mark (release the work to) and who to unmark (research M5). */
  apply: (classId: string, activityId: string, batch: AttendanceBatch) => apiClient.post<Room>(attendancePath(classId, activityId), batch),
};

/** "Liberar retorno": keyed by the pause, so a double click never ends a later one (research M7). */
export const pausesApi = {
  release: (classId: string, activityId: string, pauseId: string) =>
    apiClient.post<TeacherPause>(`/classes/${classId}/activities/${activityId}/pauses/${pauseId}/release`, {}),
};

const myPausePath = (activityId: string) => `/me/activities/${activityId}/attempt/pause`;

/** The student's own room exit (016 contracts/http-api.md, "Student routes"). */
export const myPauseApi = {
  /** 201 for a new pause, 200 with the one already open (another tab). */
  declare: (activityId: string, body: DeclareExit) => apiClient.post<StudentPause>(myPausePath(activityId), body),
  get: (activityId: string) => apiClient.get<MyPause>(myPausePath(activityId)),
};
