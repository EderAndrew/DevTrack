import { Injectable } from "@nestjs/common";
import type { ActorType, Prisma } from "../../generated/prisma/client";
import type { Tx } from "../../platform/database/transaction";
import {
  AUDIT_EVENT_METADATA,
  type AuditEventType,
  type AuditMetadata,
  type AuditTargetType,
} from "./audit-event-types";

export interface AuditEntry<T extends AuditEventType> {
  type: T;
  actorType: ActorType;
  actorUserId?: string | null;
  targetType?: AuditTargetType | null;
  targetId?: string | null;
  /** NULL only for events of the operational CLI (they identify the origin in metadata). */
  requestId?: string | null;
  metadata?: AuditMetadata<T>;
}

export class AuditMetadataError extends Error {
  constructor(type: string, key: string) {
    super(`Metadata key "${key}" is not allowed for audit event "${type}"`);
    this.name = "AuditMetadataError";
  }
}

/** Anything exposing the audit table: the Prisma client or an interactive transaction. */
type AuditWriter = Pick<Tx, "auditEvent">;

/**
 * Writes the append-only audit trail (FR-070, FR-071). Pass the transaction of the audited
 * operation so both commit or roll back together.
 */
@Injectable()
export class AuditService {
  async record<T extends AuditEventType>(tx: AuditWriter, entry: AuditEntry<T>): Promise<void> {
    const metadata = sanitizeMetadata(entry.type, entry.metadata ?? {});
    await tx.auditEvent.create({
      data: {
        type: entry.type,
        actorType: entry.actorType,
        actorUserId: entry.actorUserId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        requestId: entry.requestId ?? null,
        metadata,
      },
    });
  }
}

export function sanitizeMetadata(type: string, metadata: Record<string, unknown>): Prisma.InputJsonObject {
  const allowed = AUDIT_EVENT_METADATA[type as AuditEventType] as readonly string[] | undefined;
  if (!allowed) throw new AuditMetadataError(type, "(unknown event type)");
  for (const key of Object.keys(metadata)) {
    if (!allowed.includes(key)) throw new AuditMetadataError(type, key);
  }
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  ) as Prisma.InputJsonObject;
}
