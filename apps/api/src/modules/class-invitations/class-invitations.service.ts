import { Injectable } from "@nestjs/common";
import type { ClassInvitationView } from "@repo/contracts";
import { generateToken, hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { alreadyEnrolled, classNotOpen, invitationAlreadyPending, notFound } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { normalizeEmail } from "../identity/email";
import { CLASS_INVITATION_VIEW_SELECT, toClassInvitationView } from "./class-invitation.view";
import { DeliveryService, INVITATION_MAIL_SELECT, toInvitationMail } from "./delivery.service";
import { InvitationRateLimit } from "./invitation-rate-limit";

/** FR-012: a class invitation is valid for 7 days from its last send by the teacher. */
export const CLASS_INVITATION_TTL_MS = 7 * 24 * 3600 * 1000;

/**
 * Class invitations of the teacher's own classes (003 US2, FR-010–FR-021). Tokens are stored
 * only as hashes; one PENDING invitation per class and e-mail is enforced by a partial unique
 * index. The e-mail goes out after commit through `DeliveryService`, with retries.
 */
@Injectable()
export class ClassInvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
    private readonly audit: AuditService,
    private readonly deliveries: DeliveryService,
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
      const deliveryId = await this.deliveries.schedule(tx, created.id, now);
      const invitation = await tx.classInvitation.findUniqueOrThrow({
        where: { id: created.id },
        select: { ...CLASS_INVITATION_VIEW_SELECT, ...INVITATION_MAIL_SELECT },
      });
      return { invitation, deliveryId };
    });

    this.deliveries.attemptNow(deliveryId, invitation.id, token, toInvitationMail(invitation));
    return toClassInvitationView(invitation);
  }

  private async lockOpenClass(tx: Tx, teacherId: string, classId: string): Promise<void> {
    const rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT status FROM classes WHERE id = ${classId}::uuid AND teacher_id = ${teacherId}::uuid FOR SHARE`;
    const row = rows[0];
    if (!row) throw notFound();
    if (row.status !== "ACTIVE") throw classNotOpen();
  }
}
