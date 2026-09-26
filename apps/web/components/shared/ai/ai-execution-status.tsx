import type { AiExecutionStatus as AiExecutionStatusValue } from "@repo/contracts";
import { Ban, CircleCheck, CircleX, Clock, Loader, type LucideIcon, TimerOff } from "lucide-react";
import { Status, type StatusVariant } from "@/components/ui/status";
import { cn } from "@/lib/utils";

interface Look {
  label: string;
  variant: StatusVariant;
  icon: LucideIcon;
  spins?: boolean;
}

const PROCESSING: Look = { label: "Processando", variant: "info", icon: Loader, spins: true };

const LOOKS: Record<AiExecutionStatusValue, Look> = {
  QUEUED: { label: "Na fila", variant: "neutral", icon: Clock },
  RUNNING: PROCESSING,
  WAITING_TOOL: PROCESSING,
  VALIDATING_OUTPUT: PROCESSING,
  COMPLETED: { label: "Concluída", variant: "success", icon: CircleCheck },
  FAILED: { label: "Falhou", variant: "danger", icon: CircleX },
  CANCELLED: { label: "Cancelada", variant: "neutral", icon: Ban },
  TIMED_OUT: { label: "Tempo esgotado", variant: "warning", icon: TimerOff },
};

const CANCELLING: Look = { label: "Cancelando…", variant: "warning", icon: Ban };

const FINAL: readonly AiExecutionStatusValue[] = ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"];

export interface AiExecutionStatusProps {
  status: AiExecutionStatusValue;
  /** A cancellation was asked and the execution has not stopped yet. */
  cancelRequested?: boolean;
  className?: string;
}

/**
 * The status of an AI execution in words and with an icon, never by color alone (006/US9-1).
 * It is a polite live region: a change is announced without moving the focus.
 */
export function AiExecutionStatus({ status, cancelRequested = false, className }: AiExecutionStatusProps) {
  const look = cancelRequested && !FINAL.includes(status) ? CANCELLING : LOOKS[status];
  const Icon = look.icon;
  return (
    <Status variant={look.variant} role="status" aria-live="polite" data-status={status} className={className}>
      <Icon aria-hidden="true" className={cn("size-4", look.spins && "motion-safe:animate-spin")} />
      {look.label}
    </Status>
  );
}
