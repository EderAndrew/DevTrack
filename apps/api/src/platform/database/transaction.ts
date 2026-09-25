import type { Prisma, PrismaClient } from "../../generated/prisma/client";

/** Interactive transaction client handed to repositories and services. */
export type Tx = Prisma.TransactionClient;

/**
 * Fixed keys for pg_advisory_xact_lock. Each key serializes one critical section across
 * all API instances and CLI processes (R14, FR-032, FR-054).
 */
export const LockKey = {
  ADMIN_BOOTSTRAP_LOCK: 7_001_001n,
  ADMIN_GUARD_LOCK: 7_001_002n,
  /** Session-level (pg_try_advisory_lock): one maintenance run at a time (R21). */
  MAINTENANCE_LOCK: 7_001_003n,
  /** Registry sync of the AI definitions at startup, one instance at a time (006 research A4). */
  AI_REGISTRY: 7_006_001n,
  /** Expiry sweep of AI proposals by the execution worker (006 research A13). */
  AI_PROPOSAL_EXPIRY: 7_006_002n,
} as const;

export type LockKey = (typeof LockKey)[keyof typeof LockKey];

export interface TransactionOptions {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  timeoutMs?: number;
}

export function runInTransaction<T>(
  prisma: PrismaClient,
  fn: (tx: Tx) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  return prisma.$transaction(fn, {
    isolationLevel: options.isolationLevel,
    timeout: options.timeoutMs ?? 10_000,
    maxWait: 5_000,
  });
}

/** Blocks until the lock is granted; released automatically at commit/rollback. */
export async function advisoryXactLock(tx: Tx, key: LockKey): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key})`;
}
