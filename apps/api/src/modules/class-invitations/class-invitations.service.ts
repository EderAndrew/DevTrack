import { Injectable } from "@nestjs/common";
import type { ClassInvitationListQuery, ClassInvitationPage, ClassInvitationView } from "@repo/contracts";
import type { Prisma } from "../../generated/prisma/client";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import { afterCursor, decodeCursor, encodeCursor, escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { alreadyEnrolled, classNotOpen, invitationAlreadyPending, notFound } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { normalizeEmail } from "../identity/email";
import { ClassInvitationStateMachine } from "./class-invitation.state-machine";
import { CLASS_INVITATION_VIEW_SELECT, effectiveStatus, toClassInvitationView } from "./class-invitation.view";
import { MailOutbox } from "../../platform/mail/outbox/mail-outbox";
import { ClassInvitationMailSubject, INVITATION_MAIL_SELECT } from "./class-invitation.mail-subject";
import { InvitationRateLimit } from "./invitation-rate-limit";

/** FR-012: a class invitation is valid for 7 days from its last send by the teacher. */
export const CLASS_INVITATION_TTL_MS = 7 * 24 * 3600 * 1000;

export const CLASS_INVITATIONS_PAGE_SIZE = 20;

/** Filter by the effective status (FR-023): an overdue PENDING invitation counts as EXPIRED. */
function statusFilter(status: ClassInvitationListQuery["status"], now: Date): Prisma.ClassInvitationWhereInput {
  switch (status ?? "PENDING") {
    case "PENDING":
      return { status: "PENDING", expiresAt: { gt: now } };
    case "EXPIRED":
      return { OR: [{ status: "EXPIRED" }, { status: "PENDING", expiresAt: { lte: now } }] };
    default:
      return { status };
  }
}

/**
 * Class invitations of the teacher's own classes (003 US2/US5, FR-010–FR-023). Tokens are stored
 * only as hashes; one PENDING invitation per class and e-mail is enforced by a partial unique
 * index. The e-mail goes through the 017 outbox: first attempt after commit, then retries.
 */
@Injectable()
export class ClassInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
    private readonly audit: AuditService,
    private readonly outbox: MailOutbox,
    private readonly mailSubject: ClassInvitationMailSubject,
    private readonly rateLimit: InvitationRateLimit,
  ) {}

  /**
   * Invites `rawEmail` to the class (FR-010): 404 outside the teacher's context, 429 over the
   * limits (before any write), 409 `CLASS_NOT_OPEN` unless the class is ACTIVE, 409
   * `ALREADY_ENROLLED` for an active enrollment, 409 `INVITATION_ALREADY_PENDING` for a pending
   * invitation (also under concurrency).
   */
  async invite(auth: AuthContext, classId: string, rawEmail: string, requestId: string | null): Promise<ClassInvitationView> {
    const teacherId = auth.userId;
    const email = normalizeEmail(rawEmail);
    await this.context.findOwnedOrNotFound(teacherId, classId);
    await this.rateLimit.beforeInvite({ teacherId, classId, email });

    const token = generateToken();
    const { invitation, deliveryId } = await this.prisma.runInTransaction(async (tx) => {
      // FOR SHARE: archiving (FOR UPDATE) waits for this invitation, then cancels it; it never misses one.
      await this.lockOpenClass(tx, teacherId, classId);

      const enrolled = await tx.enrollment.findFirst({
        where: { classId, status: "ACTIVE", student: { user: { email } } },
        select: { id: true },
      });
      if (enrolled) throw alreadyEnrolled();

      const now = new Date();
      await tx.classInvitation.updateMany({
        where: { classId, email, status: "PENDING", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      });
      // ON CONFLICT DO NOTHING against the partial unique index: a concurrent invite does not abort us.
      const [created] = await tx.classInvitation.createManyAndReturn({
        data: [
          {
            classId,
            email,
            tokenHash: hashToken(token),
            status: "PENDING",
            expiresAt: new Date(now.getTime() + CLASS_INVITATION_TTL_MS),
            lastSentAt: now,
            invitedById: teacherId,
          },
        ],
        select: { id: true },
        skipDuplicates: true,
      });
      if (!created) throw invitationAlreadyPending();

      await this.audit.record(tx, {
        type: "class_invitation.created",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "CLASS_INVITATION",
        targetId: created.id,
        requestId,
        metadata: { classId, email },
      });
      const deliveryId = await this.outbox.schedule(tx, "CLASS_INVITATION", created.id, now);
      const invitation = await tx.classInvitation.findUniqueOrThrow({
        where: { id: created.id },
        select: { ...CLASS_INVITATION_VIEW_SELECT, ...INVITATION_MAIL_SELECT },
      });
      return { invitation, deliveryId };
    });

    this.outbox.attemptNow(deliveryId, this.mailSubject.mail(invitation, token));
    return toClassInvitationView(invitation);
  }

  /**
   * Invitations of the class, newest first, 20 per page (FR-023): search by part of the e-mail
   * and filter by the effective status, PENDING by default.
   */
  async list(teacherId: string, classId: string, { query, status, cursor }: ClassInvitationListQuery): Promise<ClassInvitationPage> {
    await this.context.findOwnedOrNotFound(teacherId, classId);
    const after = cursor ? decodeCursor(cursor) : null;
    const term = query?.trim().toLowerCase() ?? "";
    const now = new Date();
    const rows = await this.prisma.classInvitation.findMany({
      where: {
        classId,
        AND: [statusFilter(status, now), ...(after ? [afterCursor(after)] : [])],
        ...(term ? { email: { contains: escapeLike(term) } } : {}),
      },
      select: CLASS_INVITATION_VIEW_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CLASS_INVITATIONS_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, CLASS_INVITATIONS_PAGE_SIZE);
    return {
      items: page.map((row) => toClassInvitationView(row, now)),
      nextCursor: rows.length > CLASS_INVITATIONS_PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
    };
  }

  /**
   * Resends a pending invitation (FR-020): new token (the previous link stops working), 7 more
   * days, `sendCount + 1`, audited, and a new delivery that retires the pending ones. Refusals
   * come before the limits are counted (404, 409 `CLASS_NOT_OPEN`, 409
   * `INVALID_STATE_TRANSITION`), then 429 over the limits. When the e-mail meanwhile has an
   * active enrollment, the invitation is cancelled (`ALREADY_ENROLLED`) and the answer is 409
   * `ALREADY_ENROLLED`.
   */
  async resend(auth: AuthContext, classId: string, invitationId: string, requestId: string | null): Promise<ClassInvitationView> {
    const teacherId = auth.userId;
    const schoolClass = await this.context.findOwnedOrNotFound(teacherId, classId);
    if (schoolClass.status !== "ACTIVE") throw classNotOpen();
    const current = await this.prisma.classInvitation.findFirst({
      where: { id: invitationId, classId },
      select: { email: true, status: true, expiresAt: true },
    });
    if (!current) throw notFound();
    ClassInvitationStateMachine.assertTransition(effectiveStatus(current), "PENDING");
    await this.rateLimit.beforeResend({ teacherId, classId, email: current.email }, invitationId);

    const token = generateToken();
    const outcome = await this.prisma.runInTransaction(async (tx) => {
      await this.lockOpenClass(tx, teacherId, classId);
      const locked = await this.lockInvitation(tx, teacherId, classId, invitationId);
      ClassInvitationStateMachine.assertTransition(effectiveStatus(locked), "PENDING");

      const enrolled = await tx.enrollment.findFirst({
        where: { classId, status: "ACTIVE", student: { user: { email: locked.email } } },
        select: { id: true },
      });
      if (enrolled) {
        await this.cancelLocked(tx, invitationId, classId, teacherId, "ALREADY_ENROLLED", requestId);
        return { kind: "enrolled" as const };
      }

      const now = new Date();
      const updated = await tx.classInvitation.update({
        where: { id: invitationId },
        data: {
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + CLASS_INVITATION_TTL_MS),
          lastSentAt: now,
          sendCount: { increment: 1 },
        },
        select: { sendCount: true },
      });
      await this.audit.record(tx, {
        type: "class_invitation.resent",
        actorType: "USER",
        actorUserId: teacherId,
        targetType: "CLASS_INVITATION",
        targetId: invitationId,
        requestId,
        metadata: { classId, sendCount: updated.sendCount },
      });
      const deliveryId = await this.outbox.schedule(tx, "CLASS_INVITATION", invitationId, now);
      const invitation = await tx.classInvitation.findUniqueOrThrow({
        where: { id: invitationId },
        select: { ...CLASS_INVITATION_VIEW_SELECT, ...INVITATION_MAIL_SELECT },
      });
      return { kind: "resent" as const, invitation, deliveryId };
    });

    // The cancellation is committed; the teacher is told why nothing was sent.
    if (outcome.kind === "enrolled") throw alreadyEnrolled();
    const { invitation, deliveryId } = outcome;
    this.outbox.attemptNow(deliveryId, this.mailSubject.mail(invitation, token));
    return toClassInvitationView(invitation);
  }

  /** Cancels a pending invitation (FR-022): the link stops working at once; audited with reason TEACHER. */
  async cancel(auth: AuthContext, classId: string, invitationId: string, requestId: string | null): Promise<ClassInvitationView> {
    const teacherId = auth.userId;
    const row = await this.prisma.runInTransaction(async (tx) => {
      const locked = await this.lockInvitation(tx, teacherId, classId, invitationId);
      ClassInvitationStateMachine.assertTransition(effectiveStatus(locked), "CANCELLED");
      await this.cancelLocked(tx, invitationId, classId, teacherId, "TEACHER", requestId);
      return tx.classInvitation.findUniqueOrThrow({ where: { id: invitationId }, select: CLASS_INVITATION_VIEW_SELECT });
    });
    return toClassInvitationView(row);
  }

  private async cancelLocked(
    tx: Tx,
    invitationId: string,
    classId: string,
    teacherId: string,
    reason: "TEACHER" | "ALREADY_ENROLLED",
    requestId: string | null,
  ): Promise<void> {
    await tx.classInvitation.update({
      where: { id: invitationId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: teacherId, cancelReason: reason },
    });
    await this.outbox.supersedePending(tx, "CLASS_INVITATION", invitationId);
    await this.audit.record(tx, {
      type: "class_invitation.cancelled",
      actorType: "USER",
      actorUserId: teacherId,
      targetType: "CLASS_INVITATION",
      targetId: invitationId,
      requestId,
      metadata: { classId, reason },
    });
  }

  /** Locks the invitation only when it belongs to `classId` of `teacherId`; otherwise 404 (D7). */
  private async lockInvitation(tx: Tx, teacherId: string, classId: string, invitationId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT ci.id FROM class_invitations ci JOIN classes c ON c.id = ci.class_id
      WHERE ci.id = ${invitationId}::uuid AND ci.class_id = ${classId}::uuid AND c.teacher_id = ${teacherId}::uuid
      FOR UPDATE OF ci`;
    if (!rows[0]) throw notFound();
    return tx.classInvitation.findUniqueOrThrow({
      where: { id: invitationId },
      select: { email: true, status: true, expiresAt: true },
    });
  }

  private async lockOpenClass(tx: Tx, teacherId: string, classId: string): Promise<void> {
    const rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM classes WHERE id = ${classId}::uuid AND teacher_id = ${teacherId}::uuid FOR SHARE`;
    const row = rows[0];
    if (!row) throw notFound();
    if (row.status !== "ACTIVE") throw classNotOpen();
  }
}
