"use client";

import { AI_FINAL_EXECUTION_STATUSES, type AiExecutionListQuery, type AiExecutionStatus } from "@repo/contracts";
import { useQuery } from "@tanstack/react-query";
import { aiExecutionsApi } from "../api/ai-executions";

/** How often an execution still in progress is fetched again (006 contracts/web-ui.md). */
export const AI_POLL_MS = 2000;

export const isFinalExecution = (status: AiExecutionStatus) =>
  (AI_FINAL_EXECUTION_STATUSES as readonly AiExecutionStatus[]).includes(status);

/** `["ai", "executions"]` for the list and `["ai", "executions", id]` for one execution. */
export const aiKeys = {
  list: (query: AiExecutionListQuery = {}) => ["ai", "executions", "list", query] as const,
  lists: () => ["ai", "executions", "list"] as const,
  execution: (id: string) => ["ai", "executions", id] as const,
  result: (id: string) => ["ai", "executions", id, "result"] as const,
};

/** One execution, refreshed every 2 s until it reaches a final status. */
export const useAiExecution = (id: string | null) =>
  useQuery({
    queryKey: aiKeys.execution(id ?? ""),
    queryFn: () => aiExecutionsApi.get(id!),
    enabled: id !== null,
    refetchInterval: (query) => (query.state.data && !isFinalExecution(query.state.data.status) ? AI_POLL_MS : false),
  });

export const useAiExecutions = (query: AiExecutionListQuery = {}) =>
  useQuery({ queryKey: aiKeys.list(query), queryFn: () => aiExecutionsApi.list(query) });

/** The validated result of a completed L1 execution. */
export const useAiExecutionResult = (id: string, enabled: boolean) =>
  useQuery({ queryKey: aiKeys.result(id), queryFn: () => aiExecutionsApi.result(id), enabled });
