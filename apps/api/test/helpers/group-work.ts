import { applyWork } from "./activities";
import type { api } from "./test-app";

// ── 023: group work, through the teacher's and the students' routes (tasks T008) ──────────────

type ApiClient = ReturnType<typeof api>;

const groupPath = (activityId: string) => `/api/me/activities/${activityId}/group`;

/** Applies a work "Em grupo" with `groupSize` (2–5, the leader included), the whole class marked present (016). */
export function applyGroupWork(client: ApiClient, classId: string, workId: string, groupSize: number) {
  return applyWork(client, classId, workId, { groupSize });
}

/** `POST /me/activities/:activityId/attempt` with the chosen classmates: the caller leads the group (023/FR-006). */
export function startGroup(client: ApiClient, activityId: string, memberIds: string[]) {
  return client.post(`/api/me/activities/${activityId}/attempt`, { memberIds });
}

/** "Continuar sozinho": an individual attempt of a group work (023/FR-007). */
export function startAlone(client: ApiClient, activityId: string) {
  return client.post(`/api/me/activities/${activityId}/attempt`, { alone: true });
}

/** `GET …/group/candidates`: the classmates the caller may still add (023/FR-005). */
export function getCandidates(client: ApiClient, activityId: string) {
  return client.get(`${groupPath(activityId)}/candidates`);
}

/** `POST …/group/members`: "Incluir integrantes", by the leader while the attempt is in progress (023/FR-016). */
export function addMembers(client: ApiClient, activityId: string, memberIds: string[]) {
  return client.post(`${groupPath(activityId)}/members`, { memberIds });
}

/** `POST …/group/editing` HAND: the leader passes the editing to a member (023/FR-013). */
export function handEditing(client: ApiClient, activityId: string, toUserId: string) {
  return client.post(`${groupPath(activityId)}/editing`, { action: "HAND", toUserId });
}

/** `POST …/group/editing` TAKE_BACK: the leader takes the editing back. */
export function takeBackEditing(client: ApiClient, activityId: string) {
  return client.post(`${groupPath(activityId)}/editing`, { action: "TAKE_BACK" });
}

/** `POST …/group/editing` RETURN: the editing member gives it back to the leader. */
export function returnEditing(client: ApiClient, activityId: string) {
  return client.post(`${groupPath(activityId)}/editing`, { action: "RETURN" });
}

/** `GET /classes/:classId/activities/:activityId/attempts/:attemptId/group`: the teacher's facts of a group attempt (023/FR-020). */
export function getAttemptGroup(client: ApiClient, classId: string, activityId: string, attemptId: string) {
  return client.get(`/api/classes/${classId}/activities/${activityId}/attempts/${attemptId}/group`);
}
