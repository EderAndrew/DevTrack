import type {
  ChangePlanStatusRequest,
  ClassPlanEnvelope,
  ClassPlanView,
  CreateTopicRequest,
  MergeTopicsRequest,
  PlanCoverage,
  ReorderTopicsRequest,
  SelectPlanSyllabusRequest,
  SplitTopicRequest,
  TopicList,
  UpdateTopicRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** The class plan and its topics (004 contracts/http-api.md, "Planejamento e tópicos"). */
export const classPlanApi = {
  get: (classId: string) => apiClient.get<ClassPlanEnvelope>(`/classes/${classId}/plan`),
  selectSyllabus: (classId: string, body: SelectPlanSyllabusRequest) =>
    apiClient.put<ClassPlanView>(`/classes/${classId}/plan/syllabus`, body),
  changeStatus: (classId: string, body: ChangePlanStatusRequest) =>
    apiClient.post<ClassPlanView>(`/classes/${classId}/plan/status`, body),
  coverage: (classId: string) => apiClient.get<PlanCoverage>(`/classes/${classId}/plan/coverage`),
  createTopic: (classId: string, body: CreateTopicRequest) =>
    apiClient.post<ClassPlanView>(`/classes/${classId}/plan/topics`, body),
  archivedTopics: (classId: string) => apiClient.get<TopicList>(`/classes/${classId}/plan/topics?status=ARCHIVED`),
  updateTopic: (classId: string, topicId: string, body: UpdateTopicRequest) =>
    apiClient.patch<ClassPlanView>(`/classes/${classId}/plan/topics/${topicId}`, body),
  mergeTopics: (classId: string, body: MergeTopicsRequest) =>
    apiClient.post<ClassPlanView>(`/classes/${classId}/plan/topics/merge`, body),
  splitTopic: (classId: string, topicId: string, body: SplitTopicRequest) =>
    apiClient.post<ClassPlanView>(`/classes/${classId}/plan/topics/${topicId}/split`, body),
  archiveTopic: (classId: string, topicId: string, planRevision: number) =>
    apiClient.post<ClassPlanView>(`/classes/${classId}/plan/topics/${topicId}/archive`, { planRevision }),
  restoreTopic: (classId: string, topicId: string, planRevision: number) =>
    apiClient.post<ClassPlanView>(`/classes/${classId}/plan/topics/${topicId}/restore`, { planRevision }),
  reorderTopics: (classId: string, body: ReorderTopicsRequest) =>
    apiClient.put<ClassPlanView>(`/classes/${classId}/plan/topic-order`, body),
};
