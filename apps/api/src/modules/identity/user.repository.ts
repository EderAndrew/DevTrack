import { Injectable } from "@nestjs/common";
import type { AccountStatus, User } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { normalizeEmail } from "./email";

export interface CreateUserData {
  /** Normalized again here: the unique index is the last barrier against duplicates (FR-001). */
  email: string;
  name: string;
  passwordHash: string;
  emailVerifiedAt?: Date | null;
}

/**
 * Access to `users`. Writes take the caller's transaction so they commit together with the
 * audit event of the same operation; reads default to the shared client.
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string, db: Tx = this.prisma): Promise<User | null> {
    return db.user.findUnique({ where: { email: normalizeEmail(email) } });
  }

  findById(id: string, db: Tx = this.prisma): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  }

  /** Throws Prisma `P2002` when the e-mail already exists; callers map it to their public response. */
  create(tx: Tx, data: CreateUserData): Promise<User> {
    return tx.user.create({
      data: {
        email: normalizeEmail(data.email),
        name: data.name,
        passwordHash: data.passwordHash,
        emailVerifiedAt: data.emailVerifiedAt ?? null,
      },
    });
  }

  /** Idempotent: `UNVERIFIED → VERIFIED` only once; returns whether this call made the change. */
  async markEmailVerified(tx: Tx, userId: string, at: Date = new Date()): Promise<boolean> {
    const { count } = await tx.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: at },
    });
    return count === 1;
  }

  async setPassword(tx: Tx, userId: string, passwordHash: string): Promise<void> {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
  }

  /** Conditional update; returns false when the account was already in `status`. */
  async setStatus(tx: Tx, userId: string, status: AccountStatus, at: Date = new Date()): Promise<boolean> {
    const { count } = await tx.user.updateMany({
      where: { id: userId, status: { not: status } },
      data: { status, statusChangedAt: at },
    });
    return count === 1;
  }
}
