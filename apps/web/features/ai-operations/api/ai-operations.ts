import type {
  AiAgentOperationsView,
  AiHealth,
  AiMetrics,
  AiMetricsPeriod,
  AiModelConfigView,
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
  changeAgentStatus: (key: string, body: ChangeAiAgentStatusRequest) =>
    apiClient.post<AiAgentOperationsView>(`/ai/operations/agents/${encodeURIComponent(key)}/status`, body),
  changeModelConfigStatus: (key: string, body: ChangeAiModelConfigStatusRequest) =>
    apiClient.post<AiModelConfigView>(`/ai/operations/model-configs/${encodeURIComponent(key)}/status`, body),
};
