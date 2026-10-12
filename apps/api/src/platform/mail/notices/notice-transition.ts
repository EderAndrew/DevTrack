import type { DeliveryStatus, UndeliveredReason } from "../../../generated/prisma/client";
import type { NoticeKind } from "./notice";

/** The delivery as the notice finds it, under its row lock. */
export interface NoticedDelivery {
  status: DeliveryStatus;
  attempts: number;
  deliveredAt: Date | null;
}

/** The columns a notice changes. */
export interface NoticeChange {
  status: "DELIVERED" | "UNDELIVERED";
  sentAt?: Date;
  deliveredAt?: Date;
  undeliveredAt?: Date;
  undeliveredReason?: UndeliveredReason;
  nextAttemptAt?: null;
}

/**
 * The effect of a stored notice on its delivery (017 research N7, data-model "Transitions"); null
 * when it only stays on record:
 * - `DELIVERED`: `SENT → DELIVERED`; never moves an `UNDELIVERED` back (out of order);
 * - `BOUNCED`/`COMPLAINED`: `SENT → UNDELIVERED`; `DELIVERED → UNDELIVERED` by spam, or by a bounce
 *   the provider emitted before the delivery it already reported (received out of order);
 * - `REJECTED` (the provider refused the message): only before the SMTP result is known;
 * - `TEMPORARY`: never; final states never move (the first final reason stays).
 * A delivery still `PENDING` moves only for a notice of its current attempt, already claimed: the
 * notice overtook the SMTP result, which is then ignored (`sent_at` comes from the notice). A notice
 * of an older attempt never moves a pending retry.
 */
export function noticeTransition(delivery: NoticedDelivery, attempt: number, kind: NoticeKind, occurredAt: Date): NoticeChange | null {
  const inFlight = delivery.status === "PENDING" && delivery.attempts >= 1 && attempt === delivery.attempts;
  const overtaken = { sentAt: occurredAt, nextAttemptAt: null };
  const undelivered = (reason: UndeliveredReason): NoticeChange => ({ status: "UNDELIVERED", undeliveredAt: occurredAt, undeliveredReason: reason });

  switch (kind) {
    case "DELIVERED":
      if (delivery.status === "SENT") return { status: "DELIVERED", deliveredAt: occurredAt };
      if (inFlight) return { status: "DELIVERED", deliveredAt: occurredAt, ...overtaken };
      return null;
    case "BOUNCED":
    case "COMPLAINED":
      if (delivery.status === "SENT") return undelivered(kind);
      if (delivery.status === "DELIVERED") {
        const emittedBeforeDelivery = delivery.deliveredAt !== null && occurredAt.getTime() <= delivery.deliveredAt.getTime();
        return kind === "COMPLAINED" || emittedBeforeDelivery ? undelivered(kind) : null;
      }
      if (inFlight) return { ...undelivered(kind), ...overtaken };
      return null;
    case "REJECTED":
      return inFlight ? { ...undelivered("REJECTED"), ...overtaken } : null;
    case "TEMPORARY":
    case "IGNORED":
      return null;
  }
}
