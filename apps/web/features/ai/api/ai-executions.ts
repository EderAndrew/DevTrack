import type { AiExecutionListQuery, AiExecutionPage, AiExecutionResult, AiExecutionView, RequestAiExecutionRequest } from "@repo/contracts";
import { apiClient } from "@/lib/api/client";

const listQuery = (query: AiExecutionListQuery) => {
  const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const text = params.toString();
  return text ? `?${text}` : "";
};

/** The session teacher's AI executions (006 contracts/http-api.md); for the screens of future agents. */
export const aiExecutionsApi = {
  request: (body: RequestAiExecutionRequest) => apiClient.post<AiExecutionView>("/ai/executions", body),
  list: (query: AiExecutionListQuery = {}) => apiClient.get<AiExecutionPage>(`/ai/executions${listQuery(query)}`),
  get: (id: string) => apiClient.get<AiExecutionView>(`/ai/executions/${id}`),
  result: (id: string) => apiClient.get<AiExecutionResult>(`/ai/executions/${id}/result`),
  cancel: (id: string) => apiClient.post<AiExecutionView>(`/ai/executions/${id}/cancel`, {}),
};
