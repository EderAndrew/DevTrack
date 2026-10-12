import { Injectable } from "@nestjs/common";
import type { InvitableRole, InvitationView } from "@repo/contracts";
import type { InvitationStatus } from "../../generated/prisma/client";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { invitationAlreadyPending, notFound, selfInviteForbidden } from "../../platform/http/errors";
import { MailOutbox } from "../../platform/mail/outbox/mail-outbox";
import { RoleRepository } from "../access-control/role.repository";
import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../identity/email";
import { InvitationStateMachine } from "./invitation.state-machine";
import { invitationMailKind, InvitationMailSubject } from "./invitation.mail-subject";
import {
  effectiveStatus,
  INVITATION_INCLUDE,
  type InvitationRow,
  toInvitationView,
} from "./invitation.view";

/** FR-041: invitations are valid for 7 days (renewed on resend). */
export const INVITATION_TTL_MS = 7 * 24 * 3600 * 1000;

export interface InvitationActor {
  id: string;
  requestId: string | null;
}

export interface CreateInvitationInput {
  email: string;
  displayName: string;
  roleKey: InvitableRole;
  issuer: { id: string; email: string };
  requestId: string | null;
}

/** Which invitations a caller manages: all of a role, or only those it issued. */
export interface InvitationScope {
  roleKey: InvitableRole;
  issuerId?: string;
}

/** Row locked for acceptance, with the fields the acceptance needs. */
export interface LockedInvitation {
  id: string;
  email: string;
  displayName: string;
  status: InvitationStatus;
  expiresAt: Date;
  invitedById: string;
  acceptedByUserId: string | null;
  roleKey: InvitableRole;
}

export type AcceptanceLookup =
  | { kind: "found"; invitation: LockedInvitation }
  /** Was PENDING but past its expiry: now written as EXPIRED; the caller commits, then refuses. */
  | { kind: "expired" }
  | { kind: "missing" };

/** An invitation just created or resent, with its token (only for the link) and its scheduled e-mail. */
export interface ScheduledInvitation {
  invitation: InvitationRow;
  token: string;
  deliveryId: string;
}

/**
 * Generic TEACHER/MANAGER invitations (FR-040–FR-043, FR-049). Tokens are stored only as
 * hashes; one PENDING invitation per e-mail and role is enforced by a partial unique index.
 * Expiry is lazy: reads show an overdue PENDING invitation as EXPIRED, and using one writes it.
 * The e-mail is scheduled in the same transaction (017 outbox) and its first attempt is made by
 * the caller after the commit (`sendInvitationMail`).
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RoleRepository,
    private readonly audit: AuditService,
    private readonly outbox: MailOutbox,
    private readonly mailSubject: InvitationMailSubject,
  ) {}

  async create(tx: Tx, input: CreateInvitationInput): Promise<ScheduledInvitation> {
    const email = normalizeEmail(input.email);
    // FR-040a: nobody invites themselves; the caller audits the attempt in its own transaction.
    if (email === normalizeEmail(input.issuer.email)) throw selfInviteForbidden();

    const role = await this.roles.findByKey(input.roleKey, tx);
    await tx.invitation.updateMany({
      where: { email, roleId: role.id, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });

    const token = generateToken();
    const now = new Date();
    // ON CONFLICT DO NOTHING against the partial unique index: a concurrent invite does not abort us.
    const [created] = await tx.invitation.createManyAndReturn({
      data: [
        {
          email,
          displayName: input.displayName,
          roleId: role.id,
          invitedById: input.issuer.id,
          tokenHash: hashToken(token),
          status: "PENDING",
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
          lastSentAt: now,
        },
      ],
      skipDuplicates: true,
    });
    if (!created) throw invitationAlreadyPending();

    await this.audit.record(tx, {
      type: "invitation.created",
      actorType: "USER",
      actorUserId: input.issuer.id,
      targetType: "INVITATION",
      targetId: created.id,
      requestId: input.requestId,
      metadata: { role: input.roleKey, email },
    });
    const invitation = await tx.invitation.findUniqueOrThrow({ where: { id: created.id }, include: INVITATION_INCLUDE });
    const deliveryId = await this.outbox.schedule(tx, invitationMailKind(input.roleKey), invitation.id, now);
    return { invitation, token, deliveryId };
  }

  /** FR-042: new token, renewed validity, previous token invalid. */
  async resend(tx: Tx, id: string, scope: InvitationScope, actor: InvitationActor): Promise<ScheduledInvitation> {
    const current = await this.lockInScope(tx, id, scope);
    InvitationStateMachine.assertTransition(effectiveStatus(current), "PENDING");

    const token = generateToken();
    const now = new Date();
    const invitation = await tx.invitation.update({
      where: { id },
      data: {
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        lastSentAt: now,
        sendCount: { increment: 1 },
      },
      include: INVITATION_INCLUDE,
    });
    await this.audit.record(tx, {
      type: "invitation.resent",
      actorType: "USER",
      actorUserId: actor.id,
      targetType: "INVITATION",
      targetId: id,
      requestId: actor.requestId,
      metadata: { sendCount: invitation.sendCount },
    });
    const deliveryId = await this.outbox.schedule(tx, invitationMailKind(invitation.role.key), id, now);
    return { invitation, token, deliveryId };
  }

  async revoke(tx: Tx, id: string, scope: InvitationScope, actor: InvitationActor): Promise<InvitationRow> {
    const current = await this.lockInScope(tx, id, scope);
    InvitationStateMachine.assertTransition(effectiveStatus(current), "REVOKED");
    const invitation = await tx.invitation.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById: actor.id },
      include: INVITATION_INCLUDE,
    });
    await this.audit.record(tx, {
      type: "invitation.revoked",
      actorType: "USER",
      actorUserId: actor.id,
      targetType: "INVITATION",
      targetId: id,
      requestId: actor.requestId,
    });
    return invitation;
  }

  /** Newest first. `status` filters by the effective status (overdue PENDING counts as EXPIRED). */
  async list(scope: InvitationScope, status?: InvitationStatus): Promise<InvitationRow[]> {
    const now = new Date();
    const statusFilter =
      status === "PENDING"
        ? { status: "PENDING" as const, expiresAt: { gt: now } }
        : status === "EXPIRED"
          ? { OR: [{ status: "EXPIRED" as const }, { status: "PENDING" as const, expiresAt: { lte: now } }] }
          : status
            ? { status }
            : {};
    return this.prisma.invitation.findMany({
      where: { role: { key: scope.roleKey }, ...(scope.issuerId ? { invitedById: scope.issuerId } : {}), ...statusFilter },
      include: INVITATION_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }

  /** Locks the invitation of `token` for acceptance; writes lazy expiry. */
  async findForAcceptance(tx: Tx, token: string): Promise<AcceptanceLookup> {
    const rows = await tx.$queryRaw<
      {
        id: string;
        email: string;
        display_name: string;
        status: InvitationStatus;
        expires_at: Date;
        invited_by_id: string;
        accepted_by_user_id: string | null;
        role_key: InvitableRole;
      }[]
    >`
      SELECT i.id, i.email, i.display_name, i.status, i.expires_at, i.invited_by_id, i.accepted_by_user_id,
             r.key AS role_key
      FROM invitations i JOIN roles r ON r.id = i.role_id
      WHERE i.token_hash = ${hashToken(token)}
      FOR UPDATE OF i`;
    const row = rows[0];
    if (!row) return { kind: "missing" };
    if (row.status === "PENDING" && row.expires_at <= new Date()) {
      await tx.invitation.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
      return { kind: "expired" };
    }
    return {
      kind: "found",
      invitation: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        status: row.status,
        expiresAt: row.expires_at,
        invitedById: row.invited_by_id,
        acceptedByUserId: row.accepted_by_user_id,
        roleKey: row.role_key,
      },
    };
  }

  /** First attempt of the scheduled e-mail; call after the transaction that created or resent the invitation has committed. */
  sendInvitationMail({ invitation, token, deliveryId }: ScheduledInvitation): void {
    this.outbox.attemptNow(deliveryId, this.mailSubject.mail(invitation, token));
  }

  /** The views of `rows`, with the situation of each invitation's e-mail (017), in one query. */
  async views(rows: readonly InvitationRow[], now: Date = new Date()): Promise<InvitationView[]> {
    const situations = await this.outbox.latestDeliveryState(
      ["INVITATION_TEACHER", "INVITATION_MANAGER"],
      rows.map((row) => row.id),
    );
    return rows.map((row) => toInvitationView(row, situations.get(row.id)!, now));
  }

  async view(row: InvitationRow): Promise<InvitationView> {
    return (await this.views([row]))[0]!;
  }

  private async lockInScope(tx: Tx, id: string, scope: InvitationScope) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT i.id FROM invitations i JOIN roles r ON r.id = i.role_id
      WHERE i.id = ${id}::uuid AND r.key = ${scope.roleKey}
        AND (${scope.issuerId ?? null}::uuid IS NULL OR i.invited_by_id = ${scope.issuerId ?? null}::uuid)
      FOR UPDATE OF i`;
    if (!rows[0]) throw notFound();
    return tx.invitation.findUniqueOrThrow({ where: { id }, select: { status: true, expiresAt: true } });
  }
}
