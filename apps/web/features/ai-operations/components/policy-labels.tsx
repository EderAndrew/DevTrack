import type { AiModelLifecycle, AiModelMode, AiModelTier, AiSelectionReason, AiTaskUnavailableReason } from "@repo/contracts";
import { CircleCheck, CircleX, FlaskConical, type LucideIcon, Pin, TriangleAlert } from "lucide-react";
import type { StatusVariant } from "@/components/ui/status";
import { Missing } from "./format";

/** The capability tiers of the model policy (009), in Portuguese. */
export const TIER: Record<AiModelTier, string> = { BASIC: "Básico", STANDARD: "Padrão", ADVANCED: "Avançado" };

export const tierLabel = (tier: AiModelTier | null) => (tier === null ? <Missing /> : TIER[tier]);

export const MODE: Record<AiModelMode, string> = { GENERATION: "Geração", DECISION: "Decisão" };

/** The lifecycle of a catalog entry; only PRODUCTION (and DEPRECATED, when nothing else is left) serves tasks. */
export const LIFECYCLE: Record<AiModelLifecycle, [string, StatusVariant, LucideIcon]> = {
  CANDIDATE: ["Candidato", "neutral", FlaskConical],
  EVALUATING: ["Em avaliação", "info", FlaskConical],
  PRODUCTION: ["Produção", "success", CircleCheck],
  DEPRECATED: ["Descontinuado", "warning", TriangleAlert],
};

/** Why the policy chose the model; a deprecated model in use is a warning (009/US5-4). */
export const SELECTION_REASON: Record<AiSelectionReason, [string, StatusVariant, LucideIcon]> = {
  OVERRIDE: ["Fixado pelo administrador", "info", Pin],
  LOWEST_COST: ["Menor custo", "success", CircleCheck],
  ONLY_CANDIDATE: ["Único aprovado", "success", CircleCheck],
  DEPRECATED_ONLY: ["Só resta modelo descontinuado", "warning", TriangleAlert],
};

export const UNAVAILABLE_REASON: Record<AiTaskUnavailableReason, string> = {
  NO_APPROVED_MODEL: "sem modelo aprovado",
  POLICY_INVALID: "política inválida",
  PROVIDER_NOT_REGISTERED: "provedor não configurado",
  ALL_BLOCKED: "modelos desabilitados ou com circuito aberto",
};

export const UNAVAILABLE_ICON: LucideIcon = CircleX;
