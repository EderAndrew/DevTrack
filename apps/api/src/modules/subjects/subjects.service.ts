import { Injectable } from "@nestjs/common";
import type {
  CreateSubjectRequest,
  SubjectListQuery,
  SubjectPage,
  SubjectStatus,
  SubjectView,
  UpdateSubjectRequest,
} from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { decodeNameCursor, encodeNameCursor, escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { notFound, subjectNameTaken } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { searchKey } from "../../platform/text/search-key";
import { AuditService } from "../audit/audit.service";
import { SubjectContextPolicy } from "./subject-context.policy";
import { SUBJECT_VIEW_SELECT, toSubjectView } from "./subject.view";

export const SUBJECTS_PAGE_SIZE = 50;

type EditableField = keyof UpdateSubjectRequest;
const EDITABLE_FIELDS: readonly EditableField[] = ["name", "description"];

/** The only unique index an insert or update of `subjects` can hit is `(teacher_id, lower(name))`. */
const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/**
 * A teacher's subjects (004 US1, FR-001, FR-002). The teacher always comes from the session,
 * never from the request; every lookup by id goes through `SubjectContextPolicy`, so another
 * teacher's subject is a plain 404 (E3). Subjects are never deleted, only deactivated.
 */
@Injectable()
export class SubjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: SubjectContextPolicy,
    private readonly audit: AuditService,
  ) {}

  /**
   * Keyset page ordered by name without accents or case (`search_key`, then id), 50 per page;
   * the search ignores case and accents (003 D10). Without `status`, both situations are listed.
   */
  async list(teacherId: string, { query, status, cursor }: SubjectListQuery): Promise<SubjectPage> {
    const after = cursor ? decodeNameCursor(cursor) : null;
    const term = query ? searchKey(query) : "";
    const rows = await this.prisma.subject.findMany({
      where: {
        teacherId,
        ...(status ? { status } : {}),
        ...(term ? { searchKey: { contains: escapeLike(term) } } : {}),
        ...(after
          ? { OR: [{ searchKey: { gt: after.name } }, { searchKey: after.name, id: { gt: after.id } }] }
          : {}),
      },
      select: SUBJECT_VIEW_SELECT,
      orderBy: [{ searchKey: "asc" }, { id: "asc" }],
      take: SUBJECTS_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, SUBJECTS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map(toSubjectView),
      nextCursor: rows.length > SUBJECTS_PAGE_SIZE && last ? encodeNameCursor({ name: last.searchKey, id: last.id }) : null,
    };
  }

  async get(teacherId: string, subjectId: string, db: Tx = this.prisma): Promise<SubjectView> {
    const row = await db.subject.findFirst({ where: { id: subjectId, teacherId }, select: SUBJECT_VIEW_SELECT });
    if (!row) throw notFound();
    return toSubjectView(row);
  }

  async create(auth: AuthContext, input: CreateSubjectRequest, requestId: string | null): Promise<SubjectView> {
    try {
      return await this.prisma.runInTransaction(async (tx) => {
        const row = await tx.subject.create({
          data: {
            teacherId: auth.userId,
            name: input.name,
            description: input.description || null,
            searchKey: searchKey(input.name),
          },
          select: SUBJECT_VIEW_SELECT,
        });
        // FR-047: never the name in the audit.
        await this.audit.record(tx, {
          type: "subject.created",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "SUBJECT",
          targetId: row.id,
          requestId,
          metadata: {},
        });
        return toSubjectView(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw subjectNameTaken();
      throw error;
    }
  }

  /** Edits name and description; the audit keeps the names of the changed fields only. */
  async update(
    auth: AuthContext,
    subjectId: string,
    input: UpdateSubjectRequest,
    requestId: string | null,
  ): Promise<SubjectView> {
    try {
      return await this.prisma.runInTransaction(async (tx) => {
        const current = await this.lockOwned(tx, auth.userId, subjectId);
        const next = {
          name: input.name ?? current.name,
          description: input.description === undefined ? current.description : input.description || null,
        };
        const fields = EDITABLE_FIELDS.filter((field) => next[field] !== current[field]);
        if (fields.length === 0) return this.get(auth.userId, subjectId, tx);

        await tx.subject.update({ where: { id: subjectId }, data: { ...next, searchKey: searchKey(next.name) } });
        await this.audit.record(tx, {
          type: "subject.updated",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "SUBJECT",
          targetId: subjectId,
          requestId,
          metadata: { fields },
        });
        return this.get(auth.userId, subjectId, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw subjectNameTaken();
      throw error;
    }
  }

  /**
   * ACTIVE ⇄ INACTIVE (US1-6); the same status is a no-op. Classes and plans of the subject are
   * untouched: an inactive subject is only no longer offered for new classes.
   */
  async changeStatus(
    auth: AuthContext,
    subjectId: string,
    to: SubjectStatus,
    requestId: string | null,
  ): Promise<SubjectView> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockOwned(tx, auth.userId, subjectId);
      if (current.status === to) return this.get(auth.userId, subjectId, tx);

      await tx.subject.update({ where: { id: subjectId }, data: { status: to } });
      await this.audit.record(tx, {
        type: "subject.updated",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "SUBJECT",
        targetId: subjectId,
        requestId,
        metadata: { fields: ["status"], status: to },
      });
      return this.get(auth.userId, subjectId, tx);
    });
  }

  /** Locks the teacher's subject row for the rest of the transaction; 404 outside the teacher's context. */
  private async lockOwned(tx: Tx, teacherId: string, subjectId: string) {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subjects WHERE id = ${subjectId}::uuid AND teacher_id = ${teacherId}::uuid FOR UPDATE`;
    if (!locked) throw notFound();
    return this.context.findOwnedOrNotFound(teacherId, subjectId, tx);
  }
}
