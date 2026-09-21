import type { InvitationStatus } from "../../generated/prisma/client";

/** Roles that can be granted by invitation (FR-040). */
export type InvitableRole = "MANAGER" | "TEACHER";

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

/** `InvitationView` of contracts/http-api.md — never the token or its hash. */
export interface InvitationView {
  id: string;
  email: string;
  displayName: string;
  role: InvitableRole;
  status: InvitationStatus;
  expiresAt: Date;
  sendCount: number;
  lastSentAt: Date;
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

export function toInvitationView(row: InvitationRow, now: Date = new Date()): InvitationView {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role.key as InvitableRole,
    status: effectiveStatus(row, now),
    expiresAt: row.expiresAt,
    sendCount: row.sendCount,
    lastSentAt: row.lastSentAt,
    invitedBy: { id: row.invitedBy.id, name: row.invitedBy.name },
  };
}
