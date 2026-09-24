import type { ClassMeetingList, UpdateClassMeetingsRequest } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The class calendar (004 contracts/http-api.md, "Calendário"). */
export const classMeetingsApi = {
  list: (classId: string) => apiClient.get<ClassMeetingList>(`/classes/${classId}/meetings`),
  update: (classId: string, body: UpdateClassMeetingsRequest) =>
    apiClient.put<ClassMeetingList>(`/classes/${classId}/meetings`, body),
};
