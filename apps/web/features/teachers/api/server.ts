import type { TeacherListResponse } from "@repo/contracts";
import { serverGet } from "@/lib/api/server";

/** Teacher roster (no filter) for the page's first render; null when there is no valid session. */
export function fetchTeachers(): Promise<TeacherListResponse | null> {
  return serverGet<TeacherListResponse>("/teachers");
}
