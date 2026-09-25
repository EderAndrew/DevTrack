import type { AiProposalStatus as AiProposalStatusValue } from "@repo/contracts";
import { CircleCheck, CircleDashed, CircleX, Clock, type LucideIcon, TimerOff } from "lucide-react";
import { Status, type StatusVariant } from "@/components/ui/status";

const LOOKS: Record<AiProposalStatusValue, [string, StatusVariant, LucideIcon]> = {
  READY_FOR_REVIEW: ["Pronta para revisão", "info", Clock],
  APPROVED: ["Aprovada", "success", CircleCheck],
  PARTIALLY_APPROVED: ["Aprovada em parte", "success", CircleDashed],
  REJECTED: ["Rejeitada", "neutral", CircleX],
  EXPIRED: ["Expirada", "warning", TimerOff],
};

export interface AiProposalStatusProps {
  status: AiProposalStatusValue;
  className?: string;
}

/** The status of an AI proposal in words and with an icon (006/US9-1), announced politely. */
export function AiProposalStatus({ status, className }: AiProposalStatusProps) {
  const [label, variant, Icon] = LOOKS[status];
  return (
    <Status variant={variant} role="status" aria-live="polite" data-status={status} className={className}>
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Status>
  );
}
