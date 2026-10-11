import type { InvitableRole, InvitationView } from "@repo/contracts";
import type { InvitationStatus } from "../../generated/prisma/client";
import type { DeliverySituation } from "../../platform/mail/outbox/delivery-state";

/** Invitation row with what the views need. */
export interface InvitationRow {
  id: string;
  email: string;
  displayName: string;
  status: InvitationStatus;
  expiresAt: Date;
  sendCount: number;
  lastSentAt: Date;
  role: { key: string };
  invitedBy: { id: string; name: string };
}

/** Prisma `include` producing an `InvitationRow`. */
export const INVITATION_INCLUDE = {
  role: { select: { key: true } },
  invitedBy: { select: { id: true, name: true } },
} as const;

/** A PENDING invitation past its expiry is shown as EXPIRED even before it is written (lazy expiry). */
export function effectiveStatus(row: Pick<InvitationRow, "status" | "expiresAt">, now: Date = new Date()): InvitationStatus {
  return row.status === "PENDING" && row.expiresAt <= now ? "EXPIRED" : row.status;
}

/**
 * `InvitationView` of the contract — never the token or its hash; dates as ISO strings (002 S4).
 * `situation`: the derived situation of the invitation's e-mail (017, `MailOutbox.latestDeliveryState`).
 */
export function toInvitationView(row: InvitationRow, situation: DeliverySituation, now: Date = new Date()): InvitationView {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role.key as InvitableRole,
    status: effectiveStatus(row, now),
    expiresAt: row.expiresAt.toISOString(),
    sendCount: row.sendCount,
    lastSentAt: row.lastSentAt.toISOString(),
    delivery: situation.delivery,
    deliveryIssue: situation.deliveryIssue,
    invitedBy: { id: row.invitedBy.id, name: row.invitedBy.name },
  };
}
