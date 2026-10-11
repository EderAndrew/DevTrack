import type { ClassInvitationStatus, ClassInvitationView } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { deriveDeliveryState } from "../../platform/mail/outbox/delivery-state";

/**
 * The view's columns plus the invitation's deliveries, newest first, from which the teacher's
 * situation is derived (017 data-model "Derived", `deriveDeliveryState`). Never the token hash.
 */
export const CLASS_INVITATION_VIEW_SELECT = {
  id: true,
  email: true,
  status: true,
  expiresAt: true,
  sendCount: true,
  lastSentAt: true,
  createdAt: true,
  deliveries: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { status: true, undeliveredReason: true } },
} as const satisfies Prisma.ClassInvitationSelect;

export type ClassInvitationViewRow = Prisma.ClassInvitationGetPayload<{ select: typeof CLASS_INVITATION_VIEW_SELECT }>;

/** Lazy expiry (D3, as R15): a PENDING invitation past `expiresAt` reads as EXPIRED. */
export function effectiveStatus(row: { status: ClassInvitationStatus; expiresAt: Date }, now = new Date()) {
  return row.status === "PENDING" && row.expiresAt <= now ? "EXPIRED" : row.status;
}

/** `ClassInvitationView` of the contract; dates as ISO (002 S4). */
export function toClassInvitationView(row: ClassInvitationViewRow, now = new Date()): ClassInvitationView {
  const { delivery, deliveryIssue } = deriveDeliveryState(row.deliveries);
  return {
    id: row.id,
    email: row.email,
    status: effectiveStatus(row, now),
    expiresAt: row.expiresAt.toISOString(),
    sendCount: row.sendCount,
    lastSentAt: row.lastSentAt.toISOString(),
    delivery,
    deliveryIssue,
    createdAt: row.createdAt.toISOString(),
  };
}
