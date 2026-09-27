import type {
  AiAgentOperationsView,
  AiHealth,
  AiMetrics,
  AiMetricsPeriod,
  AiModelCatalogView,
  AiModelConfigView,
  AiTaskPolicyView,
  ChangeAiAgentStatusRequest,
  ChangeAiModelConfigStatusRequest,
} from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

/** AI operations of the administrator (006 contracts/http-api.md): aggregates and configuration only. */
export const aiOperationsApi = {
  health: () => apiClient.get<AiHealth>("/ai/operations/health"),
  metrics: (period: AiMetricsPeriod) => apiClient.get<AiMetrics>(`/ai/operations/metrics?period=${period}`),
  agents: () => apiClient.get<AiAgentOperationsView[]>("/ai/operations/agents"),
  modelConfigs: () => apiClient.get<AiModelConfigView[]>("/ai/operations/model-configs"),
  // 009 — the model catalog (with the real cost per execution in the period) and the task policies.
  models: (period: AiMetricsPeriod) => apiClient.get<AiModelCatalogView[]>(`/ai/operations/models?period=${period}`),
  tasks: () => apiClient.get<AiTaskPolicyView[]>("/ai/operations/tasks"),
  changeAgentStatus: (key: string, body: ChangeAiAgentStatusRequest) =>
    apiClient.post<AiAgentOperationsView>(`/ai/operations/agents/${encodeURIComponent(key)}/status`, body),
  changeModelConfigStatus: (key: string, body: ChangeAiModelConfigStatusRequest) =>
    apiClient.post<AiModelConfigView>(`/ai/operations/model-configs/${encodeURIComponent(key)}/status`, body),
};
