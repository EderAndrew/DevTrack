import type {
  ClassPlanEnvelope,
  ClassPlanView,
  CreateTopicRequest,
  PlanCoverage,
  SelectPlanSyllabusRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The class plan and its topics (004 contracts/http-api.md, "Planejamento e tópicos"). */
export const classPlanApi = {
  get: (classId: string) => apiClient.get<ClassPlanEnvelope>(`/classes/${classId}/plan`),
  selectSyllabus: (classId: string, body: SelectPlanSyllabusRequest) =>
    apiClient.put<ClassPlanView>(`/classes/${classId}/plan/syllabus`, body),
  coverage: (classId: string) => apiClient.get<PlanCoverage>(`/classes/${classId}/plan/coverage`),
  createTopic: (classId: string, body: CreateTopicRequest) =>
    apiClient.post<ClassPlanView>(`/classes/${classId}/plan/topics`, body),
};
