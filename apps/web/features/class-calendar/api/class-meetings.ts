import type { ClassMeetingList, UpdateClassMeetingsBody } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The class calendar (004 contracts/http-api.md, "Calendário"). */
export const classMeetingsApi = {
  list: (classId: string) => apiClient.get<ClassMeetingList>(`/classes/${classId}/meetings`),
  update: (classId: string, body: UpdateClassMeetingsBody) =>
    apiClient.put<ClassMeetingList>(`/classes/${classId}/meetings`, body),
};
