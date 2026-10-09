import type { Room } from "@repo/contracts";
import type { api } from "./test-app";

// ── 016: the attendance of a work, through the teacher's routes (tasks T013) ─────────────────

type ApiClient = ReturnType<typeof api>;

const attendancePath = (classId: string, activityId: string) => `/api/classes/${classId}/activities/${activityId}/attendance`;

/** `GET …/attendance`: the room of a `PRESENT_ONLY` work (016/FR-003, FR-020). */
export function getRoom(client: ApiClient, classId: string, activityId: string) {
  return client.get(attendancePath(classId, activityId));
}

/** `POST …/attendance` with the whole batch, for the tests that send both lists or an invalid one. */
export function postAttendance(client: ApiClient, classId: string, activityId: string, batch: { mark?: string[]; unmark?: string[] }) {
  return client.post(attendancePath(classId, activityId), { mark: batch.mark ?? [], unmark: batch.unmark ?? [] });
}

/** Marks `studentUserIds` present: releases the work to them (016/FR-003). */
export function markPresent(client: ApiClient, classId: string, activityId: string, studentUserIds: string[]) {
  return postAttendance(client, classId, activityId, { mark: studentUserIds });
}

/** Unmarks `studentUserIds`: allowed only while they have no attempt (016/FR-005). */
export function unmark(client: ApiClient, classId: string, activityId: string, studentUserIds: string[]) {
  return postAttendance(client, classId, activityId, { unmark: studentUserIds });
}

/**
 * Marks every ACTIVE student of the class present, as "Marcar todos" → "Liberar" does, when the
 * activity takes attendance (`PRESENT_ONLY`); an `ALL_ENROLLED` one is left as it is. Fails loudly
 * on any other answer, so a suite never goes on with students who can't see the work.
 */
export async function markAllPresent(client: ApiClient, classId: string, activityId: string): Promise<void> {
  const room = await getRoom(client, classId, activityId);
  if (room.status !== 200) throw new Error(`room of ${activityId}: ${room.status} ${JSON.stringify(room.body)}`);
  const ids = (room.body as Room).students.filter((student) => student.markedAt === null).map((student) => student.studentUserId);
  if (ids.length === 0) return;
  const marked = await markPresent(client, classId, activityId, ids);
  if (marked.status !== 200) throw new Error(`attendance of ${activityId}: ${marked.status} ${JSON.stringify(marked.body)}`);
}
