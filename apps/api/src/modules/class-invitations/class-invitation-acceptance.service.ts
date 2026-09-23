import { Injectable, Logger } from "@nestjs/common";
import type {
  AcceptClassInvitationRequest,
  AcceptanceMode,
  ClassInvitationAccepted,
  ClassInvitationPreview,
} from "@repo/contracts";
import { type ClassInvitationStatus, Prisma } from "../../generated/prisma/client";
import { hashToken } from "../../platform/crypto/tokens";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { AppException, raRequired, raTaken, tokenExpired, tokenInvalid } from "../../platform/http/errors";
import type { RequestContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { PublicRateLimit } from "../auth/public-rate-limit";
import { SessionService } from "../auth/session.service";
import { normalizeRa } from "../identity/ra";
import { RoleGrantAcceptance } from "../provisioning/role-grant-acceptance.service";

/** Why an invitation that exists cannot be used; audited as `class_invitation.acceptance_refused`. */
type RefusalReason = "WRONG_ACCOUNT" | "SIGN_IN_REQUIRED" | "CLASS_NOT_OPEN" | "TEACHER_INACTIVE" | "ACCOUNT_SUSPENDED";

/** Why a token was not usable at all; logged as `class_invitation.token_rejected`, never audited. */
type RejectionReason = "UNKNOWN" | "EXPIRED" | "NOT_PENDING";

/** Refusals of `RoleGrantAcceptance` that are audited. */
const AUDITED_ERRORS: Partial<Record<string, RefusalReason>> = {
  SIGN_IN_REQUIRED: "SIGN_IN_REQUIRED",
  WRONG_ACCOUNT: "WRONG_ACCOUNT",
};

interface LockedInvitation {
  id: string;
  classId: string;
  email: string;
  status: ClassInvitationStatus;
  invitedById: string;
  acceptedByUserId: string | null;
  schoolClass: {
    name: string;
    code: string;
    academicYear: number;
    period: string | null;
    status: string;
    teacherId: string;
    teacher: { name: string };
  };
}

type Lookup = { kind: "found"; invitation: LockedInvitation } | { kind: "rejected"; reason: RejectionReason };

type Outcome =
  | { kind: "accepted"; result: ClassInvitationAccepted; sessionUserId: string | null }
  | { kind: "rejected"; reason: RejectionReason }
  | { kind: "refused"; reason: RefusalReason; invitationId: string };

export interface AcceptOutcome {
  result: ClassInvitationAccepted;
  /** New session for CREATE_ACCOUNT and CLAIM_ACCOUNT, created after the acceptance committed. */
  session: { secret: string; absoluteExpiresAt: Date } | null;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * Public acceptance of class invitations by the token holder (003 US3/US4, D4, D11). The
 * invitation row is locked for the whole acceptance, so concurrent or repeated acceptances
 * produce one account and one enrollment. Account, STUDENT role, student profile with RA,
 * enrollment and the ACCEPTED invitation are written in one transaction; the session starts
 * after it commits. An expired token answers `TOKEN_EXPIRED`; any other unusable one
 * `TOKEN_INVALID`, including an invitation whose class stopped accepting students or whose
 * teacher lost the TEACHER role.
 */
@Injectable()
export class ClassInvitationAcceptanceService {
  private readonly logger = new Logger("ClassInvitationAcceptance");

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: PublicRateLimit,
    private readonly acceptance: RoleGrantAcceptance,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async preview(token: string, ctx: RequestContext): Promise<ClassInvitationPreview> {
    await this.rateLimit.enforce("class_invitation_preview", hashToken(token), ctx);
    const outcome = await this.prisma.runInTransaction(async (tx) => {
      const lookup = await this.lock(tx, token);
      if (lookup.kind === "rejected") return lookup;
      const { invitation } = lookup;
      if (invitation.status !== "PENDING") return { kind: "rejected" as const, reason: "NOT_PENDING" as const };
      if (await this.refusalFor(tx, invitation)) return { kind: "refused" as const };

      const user = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { studentProfile: { select: { ra: true } } },
      });
      const { schoolClass } = invitation;
      const preview: ClassInvitationPreview = {
        class: {
          name: schoolClass.name,
          code: schoolClass.code,
          academicYear: schoolClass.academicYear,
          period: schoolClass.period,
        },
        teacherName: schoolClass.teacher.name,
        email: invitation.email,
        mode: await this.acceptance.resolveMode(tx, invitation.email),
        raRequired: !user?.studentProfile?.ra,
      };
      return { kind: "ok" as const, preview };
    });

    if (outcome.kind === "ok") return outcome.preview;
    if (outcome.kind === "rejected") this.reject(outcome.reason);
    throw tokenInvalid();
  }

  async accept(body: AcceptClassInvitationRequest, ctx: RequestContext): Promise<AcceptOutcome> {
    await this.rateLimit.enforce("class_invitation_accept", hashToken(body.token), ctx);
    const currentUserId = ctx.auth?.userId ?? null;
    let pendingInvitationId: string | null = null;

    let outcome: Outcome;
    try {
      outcome = await this.prisma.runInTransaction<Outcome>(async (tx) => {
        const lookup = await this.lock(tx, body.token);
        if (lookup.kind === "rejected") return lookup;
        const { invitation } = lookup;

        // The account that accepted repeats its own acceptance: 200 without effects.
        if (invitation.status === "ACCEPTED" && currentUserId && invitation.acceptedByUserId === currentUserId) {
          return {
            kind: "accepted",
            result: {
              classId: invitation.classId,
              mode: await this.acceptance.resolveMode(tx, invitation.email),
              alreadyEnrolled: true,
            },
            sessionUserId: null,
          };
        }
        if (invitation.status !== "PENDING") return { kind: "rejected", reason: "NOT_PENDING" };

        const refusal = await this.refusalFor(tx, invitation);
        if (refusal) return { kind: "refused", reason: refusal, invitationId: invitation.id };

        pendingInvitationId = invitation.id;
        const result = await this.acceptPending(tx, invitation, body, currentUserId, ctx);
        pendingInvitationId = null;
        const startsSession = result.mode === "CREATE_ACCOUNT" || result.mode === "CLAIM_ACCOUNT";
        return { kind: "accepted", result: result.accepted, sessionUserId: startsSession ? result.userId : null };
      });
    } catch (error) {
      const reason = error instanceof AppException ? AUDITED_ERRORS[error.code] : undefined;
      if (reason && pendingInvitationId) await this.auditRefusal(pendingInvitationId, reason, currentUserId, ctx);
      throw error;
    }

    if (outcome.kind === "rejected") this.reject(outcome.reason);
    if (outcome.kind === "refused") {
      await this.auditRefusal(outcome.invitationId, outcome.reason, currentUserId, ctx);
      throw tokenInvalid();
    }

    const userId = outcome.sessionUserId;
    const session = userId ? await this.prisma.runInTransaction((tx) => this.sessions.create(tx, userId)) : null;
    return {
      result: outcome.result,
      session: session && { secret: session.secret, absoluteExpiresAt: session.absoluteExpiresAt },
    };
  }

  /**
   * Account (through `RoleGrantAcceptance`), RA, enrollment and the ACCEPTED invitation. Throws
   * to roll everything back.
   */
  private async acceptPending(
    tx: Tx,
    invitation: LockedInvitation,
    body: AcceptClassInvitationRequest,
    currentUserId: string | null,
    ctx: RequestContext,
  ): Promise<{ accepted: ClassInvitationAccepted; userId: string; mode: AcceptanceMode }> {
    const granted = await this.acceptance.accept(tx, {
      email: invitation.email,
      roleKey: "STUDENT",
      displayName: body.name ?? "",
      password: body.password ?? null,
      currentUserId,
      issuerUserId: invitation.invitedById,
      via: "CLASS_INVITATION",
      requestId: ctx.requestId,
    });
    const { userId, mode } = granted;
    const byUser = currentUserId === userId;
    const actor = { actorType: byUser ? ("USER" as const) : ("ANONYMOUS" as const), actorUserId: byUser ? userId : null };

    // RA: required while the profile has none; an existing RA is kept (FR-041).
    const profile = await tx.studentProfile.findUniqueOrThrow({ where: { userId }, select: { ra: true } });
    let raAdded = false;
    if (!profile.ra) {
      if (!body.ra) throw raRequired();
      try {
        await tx.studentProfile.update({ where: { userId }, data: { ra: normalizeRa(body.ra) } });
      } catch (error) {
        if (isUniqueViolation(error)) throw raTaken();
        throw error;
      }
      raAdded = true;
    }
    if (granted.studentProfileCreated || raAdded) {
      await this.audit.record(tx, {
        type: "student.registered",
        ...actor,
        targetType: "STUDENT_PROFILE",
        targetId: userId,
        requestId: ctx.requestId,
        metadata: { userId, via: "CLASS_INVITATION" },
      });
    }

    // ON CONFLICT DO NOTHING against the partial unique index of active enrollments.
    const [enrollment] = await tx.enrollment.createManyAndReturn({
      data: [
        {
          classId: invitation.classId,
          studentUserId: userId,
          status: "ACTIVE",
          enrolledAt: new Date(),
          invitationId: invitation.id,
        },
      ],
      select: { id: true },
      skipDuplicates: true,
    });
    if (enrollment) {
      await this.audit.record(tx, {
        type: "enrollment.created",
        ...actor,
        targetType: "ENROLLMENT",
        targetId: enrollment.id,
        requestId: ctx.requestId,
        metadata: { classId: invitation.classId, userId, invitationId: invitation.id },
      });
    }
    const alreadyEnrolled = !enrollment;

    await tx.classInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: userId },
    });
    await this.audit.record(tx, {
      type: "class_invitation.accepted",
      ...actor,
      targetType: "CLASS_INVITATION",
      targetId: invitation.id,
      requestId: ctx.requestId,
      metadata: { classId: invitation.classId, userId, mode, alreadyEnrolled },
    });

    return { accepted: { classId: invitation.classId, mode, alreadyEnrolled }, userId, mode };
  }

  /** Locks the invitation of `token`; lazy expiry is written (the caller commits it). */
  private async lock(tx: Tx, token: string): Promise<Lookup> {
    const rows = await tx.$queryRaw<{ id: string; status: ClassInvitationStatus; expires_at: Date }[]>`
      SELECT id, status, expires_at FROM class_invitations WHERE token_hash = ${hashToken(token)} FOR UPDATE`;
    const row = rows[0];
    if (!row) return { kind: "rejected", reason: "UNKNOWN" };
    if (row.status === "EXPIRED") return { kind: "rejected", reason: "EXPIRED" };
    if (row.status === "PENDING" && row.expires_at <= new Date()) {
      await tx.classInvitation.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
      return { kind: "rejected", reason: "EXPIRED" };
    }
    const invitation = await tx.classInvitation.findUniqueOrThrow({
      where: { id: row.id },
      select: {
        id: true,
        classId: true,
        email: true,
        status: true,
        invitedById: true,
        acceptedByUserId: true,
        schoolClass: {
          select: {
            name: true,
            code: true,
            academicYear: true,
            period: true,
            status: true,
            teacherId: true,
            teacher: { select: { name: true } },
          },
        },
      },
    });
    return { kind: "found", invitation };
  }

  /** A pending invitation that can no longer be used for reasons outside the token itself. */
  private async refusalFor(tx: Tx, invitation: LockedInvitation): Promise<RefusalReason | null> {
    if (invitation.schoolClass.status !== "ACTIVE") return "CLASS_NOT_OPEN";
    const teacherRole = await tx.userRole.findFirst({
      where: { userId: invitation.schoolClass.teacherId, status: "ACTIVE", role: { key: "TEACHER" } },
      select: { id: true },
    });
    if (!teacherRole) return "TEACHER_INACTIVE";
    const account = await tx.user.findUnique({ where: { email: invitation.email }, select: { status: true } });
    if (account?.status === "SUSPENDED") return "ACCOUNT_SUSPENDED";
    return null;
  }

  private reject(reason: RejectionReason): never {
    this.logger.warn({ reason }, "class_invitation.token_rejected");
    throw reason === "EXPIRED" ? tokenExpired() : tokenInvalid();
  }

  /** The acceptance did not happen; the refusal is recorded in its own transaction. */
  private async auditRefusal(
    invitationId: string,
    reason: RefusalReason,
    currentUserId: string | null,
    ctx: RequestContext,
  ): Promise<void> {
    await this.audit.record(this.prisma, {
      type: "class_invitation.acceptance_refused",
      actorType: currentUserId ? "USER" : "ANONYMOUS",
      actorUserId: currentUserId,
      targetType: "CLASS_INVITATION",
      targetId: invitationId,
      requestId: ctx.requestId,
      metadata: { reason },
    });
  }
}
