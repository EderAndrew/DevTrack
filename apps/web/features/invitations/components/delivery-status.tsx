import type { DeliveryIssue, DeliveryState } from "@repo/contracts";
import { Badge } from "@/components/ui/badge";
import { DELIVERY_ISSUE_TEXTS, DELIVERY_LABELS } from "@/lib/messages/status-labels";

const VARIANT = {
  SENDING: "neutral",
  FAILED: "danger",
  UNDELIVERED: "warning",
} as const satisfies Record<Exclude<DeliveryState, "SENT">, "neutral" | "danger" | "warning">;

export interface DeliveryStatusProps {
  delivery: DeliveryState;
  deliveryIssue: DeliveryIssue | null;
}

/**
 * The e-mail of a pending invitation (003 FR-019, 017 contracts/web-ui.md), always in words, never
 * colour alone: "Enviando", "Envio falhou", or "Não entregue" with the reason; nothing once sent.
 * The lists show it only next to an invitation still pending.
 */
export function DeliveryStatus({ delivery, deliveryIssue }: DeliveryStatusProps) {
  if (delivery === "SENT") return null;
  return (
    <>
      <Badge variant={VARIANT[delivery]}>{DELIVERY_LABELS[delivery]}</Badge>
      {delivery === "UNDELIVERED" && deliveryIssue ? <span className="text-body-sm text-text-secondary">{DELIVERY_ISSUE_TEXTS[deliveryIssue]}</span> : null}
    </>
  );
}
