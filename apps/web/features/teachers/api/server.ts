import type { InvitationListResponse, TeacherListResponse } from "@repo/contracts";
import { serverGet } from "@/lib/api/server";

/** Teacher roster (no filter) for the page's first render; null when there is no valid session. */
export function fetchTeachers(): Promise<TeacherListResponse | null> {
  return serverGet<TeacherListResponse>("/teachers");
}

/** Teacher invitations with their e-mail's delivery situation (017), for the page's first render. */
export function fetchTeacherInvitations(): Promise<InvitationListResponse | null> {
  return serverGet<InvitationListResponse>("/teacher-invitations");
}
