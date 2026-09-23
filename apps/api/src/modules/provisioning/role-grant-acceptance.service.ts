import { Injectable } from "@nestjs/common";
import type { AcceptanceMode, RoleKey } from "@repo/contracts";
import type { GrantSource } from "../../generated/prisma/client";
import type { Tx } from "../../platform/database/transaction";
import {
  passwordRequired,
  selfInviteForbidden,
  signInRequired,
  tokenInvalid,
  validationError,
  wrongAccount,
} from "../../platform/http/errors";
import { RoleRepository } from "../access-control/role.repository";
import { AuditService } from "../audit/audit.service";
import { SessionService } from "../auth/session.service";
import { normalizeEmail } from "../identity/email";
import { PasswordHasher } from "../identity/password-hasher";
import { PasswordPolicy } from "../identity/password-policy";
import { ProfileRepository } from "../identity/profile.repository";
import { UserRepository } from "../identity/user.repository";

export interface AcceptInput {
  email: string;
  roleKey: RoleKey;
  /**
   * Name of the account when it is created or claimed: chosen by the issuer for TEACHER/MANAGER
   * (also `TeacherProfile.displayName`), typed by the student for STUDENT (003). Required in
   * those two modes; SIGN_IN_REQUIRED keeps the account's name.
   */
  displayName: string;
  password?: string | null;
  /** User of the request's session, when there is one. */
  currentUserId?: string | null;
  /** Who issued the invitation; null for the operator-issued ADMIN bootstrap. */
  issuerUserId?: string | null;
  via: Extract<GrantSource, "INVITATION" | "ADMIN_BOOTSTRAP" | "CLASS_INVITATION">;
  requestId?: string | null;
}

export interface AcceptResult {
  mode: AcceptanceMode;
  userId: string;
  userRoleId: string;
  /** false when the user already had an assignment of this role (idempotent repeat). */
  roleGranted: boolean;
  revokedSessions: number;
  /** CLAIM_ACCOUNT only: pending verification/reset tokens of the claimed account that were invalidated. */
  invalidatedTokens: number;
  /** STUDENT only: true when this acceptance created the student profile. */
  studentProfileCreated: boolean;
}

interface LockedUser {
  id: string;
  email_verified_at: Date | null;
}

/**
 * Single acceptance path for TEACHER/MANAGER invitations, ADMIN activation (R15,
 * FR-044–FR-048, FR-035) and class invitations, which grant STUDENT (003 D4). Runs inside the caller's transaction, which has already locked the
 * invitation/bootstrap row (`SELECT … FOR UPDATE`) and validated its token; this service
 * owns everything that concerns the identity receiving the role.
 *
 * Refusals throw and roll the transaction back. Refusals that must be audited
 * (`invitation.acceptance_refused`, `SELF_INVITE`) are recorded by the caller in a separate
 * transaction.
 */
@Injectable()
export class RoleGrantAcceptance {
  constructor(
    private readonly users: UserRepository,
    private readonly profiles: ProfileRepository,
    private readonly roles: RoleRepository,
    private readonly sessions: SessionService,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
  ) {}

  /** Mode for the e-mail as it is now; `accept` re-evaluates it under a row lock. */
  async resolveMode(tx: Tx, email: string): Promise<AcceptanceMode> {
    const user = await this.users.findByEmail(email, tx);
    return modeFor(user && { id: user.id, email_verified_at: user.emailVerifiedAt });
  }

  async accept(tx: Tx, input: AcceptInput): Promise<AcceptResult> {
    const email = normalizeEmail(input.email);
    const existing = await this.lockUserByEmail(tx, email);
    const mode = modeFor(existing);

    // FR-040a / FR-055: nobody grants a privileged role to themselves, whatever the branch. A
    // teacher may invite their own e-mail to a class (003 D4).
    const privileged = input.roleKey !== "STUDENT";
    if (privileged && existing && input.issuerUserId && existing.id === input.issuerUserId) throw selfInviteForbidden();

    let userId: string;
    let revokedSessions = 0;
    let invalidatedTokens = 0;

    switch (mode) {
      case "CREATE_ACCOUNT": {
        if (!input.displayName) throw validationError();
        const passwordHash = await this.validatedHash(input.password);
        // A concurrent acceptance may have created the identity after our lookup: ON CONFLICT
        // DO NOTHING waits for it, and the loser is refused like a replayed token (FR-044, FR-049).
        const { count } = await tx.user.createMany({
          data: [{ email, name: input.displayName, passwordHash, emailVerifiedAt: new Date() }],
          skipDuplicates: true,
        });
        if (count === 0) throw tokenInvalid();
        userId = (await this.users.findByEmail(email, tx))!.id;
        break;
      }

      case "SIGN_IN_REQUIRED": {
        // FR-047: the verified owner proves it by its session; any password sent is ignored.
        if (!input.currentUserId) throw signInRequired();
        if (input.currentUserId !== existing!.id) throw wrongAccount();
        userId = existing!.id;
        break;
      }

      case "CLAIM_ACCOUNT": {
        // FR-048: same identity, new password, e-mail proven by the link, old sessions revoked.
        if (!input.displayName) throw validationError();
        const passwordHash = await this.validatedHash(input.password);
        userId = existing!.id;
        await this.users.setPassword(tx, userId, passwordHash);
        await this.users.markEmailVerified(tx, userId);
        revokedSessions = await this.sessions.revokeAllForUser(tx, userId, "ACCOUNT_CLAIMED");
        // Nothing of whoever pre-registered the address survives the claim (US6-10): pending
        // links die and the account takes the name given by the issuer.
        const now = new Date();
        const { count } = await tx.userToken.updateMany({
          where: { userId, usedAt: null, invalidatedAt: null },
          data: { invalidatedAt: now },
        });
        invalidatedTokens = count;
        await tx.user.update({ where: { id: userId }, data: { name: input.displayName } });
        await tx.studentProfile.updateMany({ where: { userId }, data: { displayName: input.displayName } });
        await this.audit.record(tx, {
          type: "account.claimed",
          actorType: "ANONYMOUS",
          targetType: "USER",
          targetId: userId,
          requestId: input.requestId,
          metadata: { via: input.via, revokedSessions },
        });
        break;
      }
    }

    const grant = await this.roles.grant(tx, userId, input.roleKey, input.issuerUserId ?? null, input.via);
    if (grant.created) {
      const byUser = mode === "SIGN_IN_REQUIRED";
      await this.audit.record(tx, {
        type: "role.granted",
        actorType: byUser ? "USER" : "ANONYMOUS",
        actorUserId: byUser ? userId : null,
        targetType: "USER_ROLE",
        targetId: grant.assignment.id,
        requestId: input.requestId,
        metadata: { userId, role: input.roleKey, via: input.via },
      });
    }

    if (input.roleKey === "TEACHER") await this.profiles.ensureTeacherProfile(tx, userId, input.displayName);

    let studentProfileCreated = false;
    if (input.roleKey === "STUDENT") {
      const hadProfile = (await tx.studentProfile.count({ where: { userId } })) > 0;
      const { name } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
      await this.profiles.ensureStudentProfile(tx, userId, name);
      studentProfileCreated = !hadProfile;
    }

    return {
      mode,
      userId,
      userRoleId: grant.assignment.id,
      roleGranted: grant.created,
      revokedSessions,
      invalidatedTokens,
      studentProfileCreated,
    };
  }

  /** Serializes concurrent acceptances for the same identity (claim vs. claim, claim vs. grant). */
  private async lockUserByEmail(tx: Tx, email: string): Promise<LockedUser | null> {
    const rows = await tx.$queryRaw<LockedUser[]>`
      SELECT id, email_verified_at FROM users WHERE email = ${email} FOR UPDATE`;
    return rows[0] ?? null;
  }

  private async validatedHash(password: string | null | undefined): Promise<string> {
    if (!password) throw passwordRequired();
    this.passwordPolicy.validate(password);
    return this.hasher.hash(password);
  }
}

/** Which branch of R15 applies to the invited e-mail. Told to the token bearer by the previews. */
function modeFor(user: LockedUser | null): AcceptanceMode {
  if (!user) return "CREATE_ACCOUNT";
  return user.email_verified_at ? "SIGN_IN_REQUIRED" : "CLAIM_ACCOUNT";
}
