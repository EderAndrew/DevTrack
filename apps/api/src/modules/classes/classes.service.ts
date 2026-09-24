import { Injectable } from "@nestjs/common";
import type {
  ClassListQuery,
  ClassPage,
  ClassStatus,
  ClassView,
  CreateClassRequest,
  UpdateClassRequest,
} from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { afterCursor, decodeCursor, encodeCursor, escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { classCodeTaken, invalidStateTransition, notFound } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { searchKey } from "../../platform/text/search-key";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "./class-context.policy";
import { ClassStateMachine } from "./class.state-machine";
import { CLASS_VIEW_SELECT, toClassView } from "./class.view";

export const CLASSES_PAGE_SIZE = 20;

/** Statuses listed when the filter is absent (FR-007): archived classes only on request. */
const DEFAULT_STATUSES: ClassStatus[] = ["ACTIVE", "INACTIVE"];

/** The 003 fields (`class.updated`); the 004 offering fields have their own audit event. */
type EditableField = Exclude<keyof UpdateClassRequest, "subjectId" | "startsOn" | "endsOn">;
const EDITABLE_FIELDS: readonly EditableField[] = ["name", "code", "academicYear", "period", "description"];

/** The only unique index an insert or update of `classes` can hit is `(teacher_id, upper(code))`. */
const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * A teacher's classes (003 US1, FR-001–FR-008). The teacher always comes from the session,
 * never from the request; every lookup by id goes through `ClassContextPolicy`, so another
 * teacher's class is a plain 404 (D7).
 */
@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
    private readonly audit: AuditService,
  ) {}

  /** Keyset page, newest first; search on `search_key` ignores case and accents (D10). */
  async list(teacherId: string, { query, year, status, cursor }: ClassListQuery): Promise<ClassPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const term = query ? searchKey(query) : "";
    const rows = await this.prisma.schoolClass.findMany({
      where: {
        teacherId,
        status: status ?? { in: DEFAULT_STATUSES },
        ...(year !== undefined ? { academicYear: year } : {}),
        ...(term ? { searchKey: { contains: escapeLike(term) } } : {}),
        ...(after ? { AND: [afterCursor(after)] } : {}),
      },
      select: CLASS_VIEW_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CLASSES_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, CLASSES_PAGE_SIZE);
    return {
      items: page.map(toClassView),
      nextCursor: rows.length > CLASSES_PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
    };
  }

  async get(teacherId: string, classId: string, db: Tx = this.prisma): Promise<ClassView> {
    const row = await db.schoolClass.findFirst({ where: { id: classId, teacherId }, select: CLASS_VIEW_SELECT });
    if (!row) throw notFound();
    return toClassView(row);
  }

  /** Number of ACTIVE enrollments of a class (FR-008). */
  activeStudentCount(classId: string, db: Tx = this.prisma): Promise<number> {
    return db.enrollment.count({ where: { classId, status: "ACTIVE" } });
  }

  async create(auth: AuthContext, input: CreateClassRequest, requestId: string | null): Promise<ClassView> {
    try {
      return await this.prisma.runInTransaction(async (tx) => {
        const row = await tx.schoolClass.create({
          data: {
            teacherId: auth.userId,
            name: input.name,
            code: input.code,
            academicYear: input.academicYear,
            period: input.period || null,
            description: input.description || null,
            searchKey: searchKey(input.name, input.code),
          },
          select: CLASS_VIEW_SELECT,
        });
        await this.audit.record(tx, {
          type: "class.created",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "CLASS",
          targetId: row.id,
          requestId,
          metadata: { code: row.code, academicYear: row.academicYear },
        });
        return toClassView(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw classCodeTaken();
      throw error;
    }
  }

  /** Edits ACTIVE or INACTIVE classes (FR-003); the audit keeps the names of the changed fields only. */
  async update(
    auth: AuthContext,
    classId: string,
    input: UpdateClassRequest,
    requestId: string | null,
  ): Promise<ClassView> {
    try {
      return await this.prisma.runInTransaction(async (tx) => {
        const current = await this.lockOwned(tx, auth.userId, classId);
        if (current.status === "ARCHIVED") throw invalidStateTransition();

        const next = {
          name: input.name ?? current.name,
          code: input.code ?? current.code,
          academicYear: input.academicYear ?? current.academicYear,
          period: input.period === undefined ? current.period : input.period || null,
          description: input.description === undefined ? current.description : input.description || null,
        };
        const fields = EDITABLE_FIELDS.filter((field) => next[field] !== current[field]);
        if (fields.length === 0) return this.get(auth.userId, classId, tx);

        await tx.schoolClass.update({
          where: { id: classId },
          data: { ...next, searchKey: searchKey(next.name, next.code) },
        });
        await this.audit.record(tx, {
          type: "class.updated",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "CLASS",
          targetId: classId,
          requestId,
          metadata: { fields },
        });
        return this.get(auth.userId, classId, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw classCodeTaken();
      throw error;
    }
  }

  /**
   * FR-004, FR-005: the same status is a no-op; any other change follows `ClassStateMachine`.
   * Archiving cancels the class's pending invitations in the same transaction (the stale ones
   * are recorded as EXPIRED, as the token would do) and keeps the enrollments.
   */
  async changeStatus(auth: AuthContext, classId: string, to: ClassStatus, requestId: string | null): Promise<ClassView> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockOwned(tx, auth.userId, classId);
      if (current.status === to) return this.get(auth.userId, classId, tx);
      ClassStateMachine.assertTransition(current.status, to);

      const now = new Date();
      let cancelledInvitations: number | undefined;
      if (to === "ARCHIVED") {
        await tx.classInvitation.updateMany({
          where: { classId, status: "PENDING", expiresAt: { lte: now } },
          data: { status: "EXPIRED" },
        });
        const cancelled = await tx.classInvitation.updateMany({
          where: { classId, status: "PENDING" },
          data: { status: "CANCELLED", cancelledAt: now, cancelledById: auth.userId, cancelReason: "CLASS_ARCHIVED" },
        });
        cancelledInvitations = cancelled.count;
      }

      await tx.schoolClass.update({ where: { id: classId }, data: { status: to, statusChangedAt: now } });
      await this.audit.record(tx, {
        type: "class.status_changed",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "CLASS",
        targetId: classId,
        requestId,
        metadata: { from: current.status, to, cancelledInvitations },
      });
      return this.get(auth.userId, classId, tx);
    });
  }

  /** Locks the teacher's class row for the rest of the transaction; 404 outside the teacher's context. */
  private async lockOwned(tx: Tx, teacherId: string, classId: string) {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM classes WHERE id = ${classId}::uuid AND teacher_id = ${teacherId}::uuid FOR UPDATE`;
    if (!locked) throw notFound();
    return this.context.findOwnedOrNotFound(teacherId, classId, tx);
  }
}
