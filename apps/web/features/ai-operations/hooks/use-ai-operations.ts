"use client";

import type { AiMetricsPeriod, ChangeAiAgentStatusRequest, ChangeAiModelConfigStatusRequest } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { aiOperationsApi } from "../api/ai-operations";

export const aiOperationsKeys = {
  all: ["ai-operations"] as const,
  health: () => [...aiOperationsKeys.all, "health"] as const,
  metrics: (period: AiMetricsPeriod) => [...aiOperationsKeys.all, "metrics", period] as const,
  agents: () => [...aiOperationsKeys.all, "agents"] as const,
  modelConfigs: () => [...aiOperationsKeys.all, "model-configs"] as const,
  models: (period: AiMetricsPeriod) => [...aiOperationsKeys.all, "models", period] as const,
  tasks: () => [...aiOperationsKeys.all, "tasks"] as const,
};

export const useAiHealth = () => useQuery({ queryKey: aiOperationsKeys.health(), queryFn: aiOperationsApi.health });

export const useAiMetrics = (period: AiMetricsPeriod) =>
  useQuery({ queryKey: aiOperationsKeys.metrics(period), queryFn: () => aiOperationsApi.metrics(period) });

export const useAiAgents = () => useQuery({ queryKey: aiOperationsKeys.agents(), queryFn: aiOperationsApi.agents });

export const useAiModelConfigs = () => useQuery({ queryKey: aiOperationsKeys.modelConfigs(), queryFn: aiOperationsApi.modelConfigs });

export const useAiModels = (period: AiMetricsPeriod) =>
  useQuery({ queryKey: aiOperationsKeys.models(period), queryFn: () => aiOperationsApi.models(period) });

export const useAiTasks = () => useQuery({ queryKey: aiOperationsKeys.tasks(), queryFn: aiOperationsApi.tasks });

/** Enables or disables an agent; the toast says the result and every AI operations list refetches. */
export function useChangeAiAgentStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ key, status }: { key: string } & ChangeAiAgentStatusRequest) => aiOperationsApi.changeAgentStatus(key, { status }),
    onSuccess: async (agent) => {
      toast({ variant: "success", title: agent.status === "DISABLED" ? `Agente ${agent.name} desabilitado.` : `Agente ${agent.name} habilitado.` });
      await queryClient.invalidateQueries({ queryKey: aiOperationsKeys.all });
    },
  });
}

/** Enables or disables a model config, with the same toast and refetch. */
export function useChangeAiModelConfigStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ key, status }: { key: string } & ChangeAiModelConfigStatusRequest) => aiOperationsApi.changeModelConfigStatus(key, { status }),
    onSuccess: async (config) => {
      toast({
        variant: "success",
        title: config.status === "DISABLED" ? `Configuração ${config.key} desabilitada.` : `Configuração ${config.key} habilitada.`,
      });
      await queryClient.invalidateQueries({ queryKey: aiOperationsKeys.all });
    },
  });
}
