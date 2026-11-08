import { type MobileExamList, MobileExamListSchema } from "@repo/contracts";
import { apiClient } from "../../../lib/api/instance";

/** `GET /mobile/exams` (024/FR-006): the teacher's exams in progress. */
export function getExams(): Promise<MobileExamList> {
  return apiClient().request("GET", "/mobile/exams", { schema: MobileExamListSchema });
}
