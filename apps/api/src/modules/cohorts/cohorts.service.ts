import { Injectable } from "@nestjs/common";
import type {
  CohortDetail,
  CohortListQuery,
  CohortPage,
  CohortStatus,
  CohortView,
  CreateCohortRequest,
  UpdateCohortRequest,
} from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { cohortArchived, cohortCodeTaken, notFound, validationError } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { searchKey } from "../../platform/text/search-key";
import { AuditService } from "../audit/audit.service";
import { ClassStateMachine } from "../classes/class.state-machine";
import { COHORT_DETAIL_SELECT, COHORT_VIEW_SELECT, toCohortDetail, toCohortView } from "./cohort.view";

export const COHORTS_PAGE_SIZE = 20;

/** Statuses listed when the filter is absent (FR-006): archived turmas only on request. */
const DEFAULT_STATUSES: CohortStatus[] = ["ACTIVE", "INACTIVE"];

const EDITABLE_FIELDS = ["name", "code", "academicYear", "period", "description"] as const;

/** The only unique index a write can hit is `(academic_year, upper(code))` (FR-002). */
const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** Position of the last item of a page ordered by `academic_year DESC, created_at DESC, id DESC`. */
interface CohortCursor {
  academicYear: number;
  createdAt: Date;
  id: string;
}

const encodeCohortCursor = (row: CohortCursor) =>
  Buffer.from(JSON.stringify({ y: row.academicYear, c: row.createdAt.toISOString(), i: row.id })).toString("base64url");

/** Throws `400 VALIDATION_ERROR` for anything `encodeCohortCursor` did not produce. */
function decodeCohortCursor(cursor: string): CohortCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { y?: unknown; c?: unknown; i?: unknown };
    const createdAt = new Date(String(parsed.c));
    if (
      !Number.isInteger(parsed.y) ||
      typeof parsed.i !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.i) ||
      Number.isNaN(createdAt.getTime())
    ) {
      throw new Error("bad cursor");
    }
    return { academicYear: parsed.y as number, createdAt, id: parsed.i };
  } catch {
    throw validationError();
  }
}

/** Rows strictly after `after` in the list's order (a Prisma `where` fragment). */
const afterCohortCursor = (after: CohortCursor): Prisma.CohortWhereInput => ({
  OR: [
    { academicYear: { lt: after.academicYear } },
    { academicYear: after.academicYear, createdAt: { lt: after.createdAt } },
    { academicYear: after.academicYear, createdAt: after.createdAt, id: { lt: after.id } },
  ],
});

const blankToNull = (value: string | null | undefined) => (value ? value : null);

/**
 * The MANAGER's turmas (027 US1, FR-001–FR-008). A turma belongs to no one: the MANAGER (and the ADMIN) see
 * and change any of them, so there is no context check beyond existence (404). The lifecycle is the 003 one
 * (`ClassStateMachine`); archiving cancels the pending invitations in the same transaction (FR-005). No route
 * deletes a turma (FR-008).
 */
@Injectable()
export class CohortsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Keyset page, most recent year then most recent creation first; search on `search_key` (no case, no accents). */
  async list({ q, academicYear, status, cursor, limit }: CohortListQuery): Promise<CohortPage> {
    const size = limit ?? COHORTS_PAGE_SIZE;
    const after = cursor ? decodeCohortCursor(cursor) : null;
    const term = q ? searchKey(q) : "";
    const rows = await this.prisma.cohort.findMany({
      where: {
        status: status ?? { in: DEFAULT_STATUSES },
        ...(academicYear !== undefined ? { academicYear } : {}),
        ...(term ? { searchKey: { contains: escapeLike(term) } } : {}),
        ...(after ? { AND: [afterCohortCursor(after)] } : {}),
      },
      select: COHORT_VIEW_SELECT,
      orderBy: [{ academicYear: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: size + 1,
    });
    const page = rows.slice(0, size);
    return {
      items: page.map(toCohortView),
      nextCursor: rows.length > size ? encodeCohortCursor(page.at(-1)!) : null,
    };
  }

  async get(cohortId: string): Promise<CohortDetail> {
    const row = await this.prisma.cohort.findUnique({ where: { id: cohortId }, select: COHORT_DETAIL_SELECT });
    if (!row) throw notFound();
    return toCohortDetail(row);
  }

  /** FR-001/FR-002: born ACTIVE with no class or student; a taken code in the same year → `409 COHORT_CODE_TAKEN`. */
  async create(auth: AuthContext, input: CreateCohortRequest, requestId: string | null): Promise<CohortView> {
    try {
      return await this.prisma.runInTransaction(async (tx) => {
        const row = await tx.cohort.create({
          data: {
            name: input.name,
            code: input.code,
            academicYear: input.academicYear,
            period: blankToNull(input.period),
            description: blankToNull(input.description),
            searchKey: searchKey(input.name, input.code),
            createdById: auth.userId,
          },
          select: COHORT_VIEW_SELECT,
        });
        await this.audit.record(tx, {
          type: "cohort.created",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "COHORT",
          targetId: row.id,
          requestId,
          metadata: { code: row.code, academicYear: row.academicYear },
        });
        return toCohortView(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw cohortCodeTaken();
      throw error;
    }
  }

  /** FR-003: edits an ACTIVE or INACTIVE turma; ARCHIVED → `409 COHORT_ARCHIVED`; the audit keeps the field names only. */
  async update(auth: AuthContext, cohortId: string, input: UpdateCohortRequest, requestId: string | null): Promise<CohortView> {
    try {
      return await this.prisma.runInTransaction(async (tx) => {
        const current = await this.lock(tx, cohortId);
        if (current.status === "ARCHIVED") throw cohortArchived();

        const next = {
          name: input.name ?? current.name,
          code: input.code ?? current.code,
          academicYear: input.academicYear ?? current.academicYear,
          period: input.period === undefined ? current.period : blankToNull(input.period),
          description: input.description === undefined ? current.description : blankToNull(input.description),
        };
        const fields = EDITABLE_FIELDS.filter((field) => next[field] !== current[field]);
        if (fields.length > 0) {
          await tx.cohort.update({
            where: { id: cohortId },
            data: { ...next, searchKey: searchKey(next.name, next.code) },
          });
          await this.audit.record(tx, {
            type: "cohort.updated",
            actorType: "USER",
            actorUserId: auth.userId,
            targetType: "COHORT",
            targetId: cohortId,
            requestId,
            metadata: { fields },
          });
        }
        return this.view(tx, cohortId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw cohortCodeTaken();
      throw error;
    }
  }

  /**
   * FR-004/FR-005: the same status is a no-op; any other change follows the 003 lifecycle. Archiving, under the
   * turma's row lock, records the stale pending invitations as EXPIRED (as the token would) and cancels the rest
   * (`CLASS_ARCHIVED`) in the same transaction; enrollments and disciplinas da turma stay as they are (their
   * effective status follows, FR-023).
   */
  async changeStatus(auth: AuthContext, cohortId: string, to: CohortStatus, requestId: string | null): Promise<CohortView> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lock(tx, cohortId);
      if (current.status === to) return this.view(tx, cohortId);
      ClassStateMachine.assertTransition(current.status, to);

      const now = new Date();
      let cancelledInvitations: number | undefined;
      if (to === "ARCHIVED") {
        await tx.classInvitation.updateMany({
          where: { cohortId, status: "PENDING", expiresAt: { lte: now } },
          data: { status: "EXPIRED" },
        });
        const cancelled = await tx.classInvitation.updateMany({
          where: { cohortId, status: "PENDING" },
          data: { status: "CANCELLED", cancelledAt: now, cancelledById: auth.userId, cancelReason: "CLASS_ARCHIVED" },
        });
        cancelledInvitations = cancelled.count;
      }

      await tx.cohort.update({ where: { id: cohortId }, data: { status: to, statusChangedAt: now } });
      await this.audit.record(tx, {
        type: "cohort.status_changed",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "COHORT",
        targetId: cohortId,
        requestId,
        metadata: { from: current.status, to, cancelledInvitations },
      });
      return this.view(tx, cohortId);
    });
  }

  private async view(tx: Tx, cohortId: string): Promise<CohortView> {
    return toCohortView(await tx.cohort.findUniqueOrThrow({ where: { id: cohortId }, select: COHORT_VIEW_SELECT }));
  }

  /** Locks the turma's row for the rest of the transaction; 404 when it does not exist. */
  private async lock(tx: Tx, cohortId: string) {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM cohorts WHERE id = ${cohortId}::uuid FOR UPDATE`;
    if (!locked) throw notFound();
    return tx.cohort.findUniqueOrThrow({ where: { id: cohortId } });
  }
}
