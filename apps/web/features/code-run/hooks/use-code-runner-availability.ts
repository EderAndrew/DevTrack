"use client";

import { useQuery } from "@tanstack/react-query";
import { codeRunnerApi } from "../api/code-runs";

/**
 * 021/US2-6: whether "Executar" would work right now, asked only by a form that offers "Permitir
 * executar o código". A notice only: the option stays available either way.
 */
export const useCodeRunnerAvailability = (enabled: boolean) =>
  useQuery({ queryKey: ["code-runner", "availability"], queryFn: () => codeRunnerApi.availability(), enabled });
