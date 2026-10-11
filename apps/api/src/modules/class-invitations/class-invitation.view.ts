import type { ClassInvitationStatus, ClassInvitationView, DeliveryState } from "@repo/contracts";
import type { DeliveryStatus, Prisma } from "../../generated/prisma/client";

/** The view's columns plus the status of the invitation's latest delivery. Never the token hash. */
export const CLASS_INVITATION_VIEW_SELECT = {
  id: true,
  email: true,
  status: true,
  expiresAt: true,
  sendCount: true,
  lastSentAt: true,
  createdAt: true,
  deliveries: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { status: true } },
} as const satisfies Prisma.ClassInvitationSelect;

export type ClassInvitationViewRow = Prisma.ClassInvitationGetPayload<{ select: typeof CLASS_INVITATION_VIEW_SELECT }>;

/**
 * What the teacher sees of the latest delivery (D5). A latest delivery that was `SUPERSEDED`
 * never reached the student (the invitation stopped being pending first), so it reads as
 * `FAILED`; an invitation without deliveries has not been sent yet.
 */
const DELIVERY_STATE: Readonly<Record<DeliveryStatus, DeliveryState>> = {
  PENDING: "SENDING",
  SENT: "SENT",
  FAILED: "FAILED",
  SUPERSEDED: "FAILED",
};

/** Lazy expiry (D3, as R15): a PENDING invitation past `expiresAt` reads as EXPIRED. */
export function effectiveStatus(row: { status: ClassInvitationStatus; expiresAt: Date }, now = new Date()) {
  return row.status === "PENDING" && row.expiresAt <= now ? "EXPIRED" : row.status;
}

/** `ClassInvitationView` of the contract; dates as ISO (002 S4). */
export function toClassInvitationView(row: ClassInvitationViewRow, now = new Date()): ClassInvitationView {
  const latest = row.deliveries[0];
  return {
    id: row.id,
    email: row.email,
    status: effectiveStatus(row, now),
    expiresAt: row.expiresAt.toISOString(),
    sendCount: row.sendCount,
    lastSentAt: row.lastSentAt.toISOString(),
    delivery: latest ? DELIVERY_STATE[latest.status] : "SENDING",
    // 017: the provider notices that fill it arrive with US2.
    deliveryIssue: null,
    createdAt: row.createdAt.toISOString(),
  };
}
