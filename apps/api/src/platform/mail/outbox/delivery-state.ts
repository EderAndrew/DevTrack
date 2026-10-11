import type { DeliveryIssue, DeliveryState } from "@repo/contracts";
import type { DeliveryStatus, UndeliveredReason } from "../../../generated/prisma/client";

/** What the inviter sees of an e-mail (contracts: `delivery` and `deliveryIssue`). */
export interface DeliverySituation {
  delivery: DeliveryState;
  deliveryIssue: DeliveryIssue | null;
}

/** One delivery row of a subject, as the derivation needs it. */
export interface DeliveryStateRow {
  status: DeliveryStatus;
  undeliveredReason: UndeliveredReason | null;
}

/** No e-mail yet: the first one is on its way (003 D5). */
const NOT_SENT_YET: DeliverySituation = { delivery: "SENDING", deliveryIssue: null };

/**
 * The situation of a subject's e-mail from its deliveries, newest first (017 data-model "Derived"):
 * `PENDING` → `SENDING`; `SENT`/`DELIVERED` → `SENT`; `FAILED` → `FAILED`; `UNDELIVERED` →
 * `UNDELIVERED` with its reason; a `DISCARDED` or `SUPERSEDED` row reads as the row before it. When
 * every row was retired, nothing reached the recipient: `FAILED`, as the 003 view showed a
 * superseded latest delivery.
 */
export function deriveDeliveryState(rowsNewestFirst: readonly DeliveryStateRow[]): DeliverySituation {
  if (rowsNewestFirst.length === 0) return NOT_SENT_YET;
  for (const row of rowsNewestFirst) {
    switch (row.status) {
      case "PENDING":
        return { delivery: "SENDING", deliveryIssue: null };
      case "SENT":
      case "DELIVERED":
        return { delivery: "SENT", deliveryIssue: null };
      case "FAILED":
        return { delivery: "FAILED", deliveryIssue: null };
      case "UNDELIVERED":
        return { delivery: "UNDELIVERED", deliveryIssue: row.undeliveredReason ?? "REJECTED" };
      case "DISCARDED":
      case "SUPERSEDED":
        continue;
    }
  }
  return { delivery: "FAILED", deliveryIssue: null };
}
