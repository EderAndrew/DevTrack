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
import {
  classCodeTaken,
  invalidStateTransition,
  meetingsOutsidePeriod,
  notFound,
  subjectInactive,
} from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { searchKey } from "../../platform/text/search-key";
import { AuditService } from "../audit/audit.service";
import { SubjectContextPolicy } from "../subjects/subject-context.policy";
import { ClassContextPolicy } from "./class-context.policy";
import { ClassStateMachine } from "./class.state-machine";
import { CLASS_VIEW_SELECT, isoDate, toClassView } from "./class.view";

export const CLASSES_PAGE_SIZE = 20;

/** Statuses listed when the filter is absent (FR-007): archived classes only on request. */
const DEFAULT_STATUSES: ClassStatus[] = ["ACTIVE", "INACTIVE"];

/** The 003 fields, audited as `class.updated` (003 contract, unchanged). */
type EditableField = Exclude<keyof UpdateClassRequest, "subjectId" | "startsOn" | "endsOn">;
const EDITABLE_FIELDS: readonly EditableField[] = ["name", "code", "academicYear", "period", "description"];

/**
 * The 004 offering fields, audited as `class.offering_updated`. `period` belongs to both
 * catalogues (003 `class.updated`, 004 `class.offering_updated`), so a change of period is
 * recorded in both events.
 */
type OfferingField = "subjectId" | "period" | "startsOn" | "endsOn";
const OFFERING_FIELDS: readonly OfferingField[] = ["subjectId", "period", "startsOn", "endsOn"];

/** A `@db.Date` value from the contract's "YYYY-MM-DD" (null stays null). */
const toDbDate = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

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
    private readonly subjects: SubjectContextPolicy,
    private readonly audit: AuditService,
  ) {}

  /** Keyset page, newest first; search on `search_key` ignores case and accents (D10). */
  async list(teacherId: string, { query, year, status, subjectId, cursor }: ClassListQuery): Promise<ClassPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const term = query ? searchKey(query) : "";
    const rows = await this.prisma.schoolClass.findMany({
      where: {
        teacherId,
        status: status ?? { in: DEFAULT_STATUSES },
        ...(year !== undefined ? { academicYear: year } : {}),
        ...(subjectId ? { subjectId } : {}),
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
        if (input.subjectId) await this.assertSubjectOffered(tx, auth.userId, input.subjectId);
        const row = await tx.schoolClass.create({
          data: {
            teacherId: auth.userId,
            name: input.name,
            code: input.code,
            academicYear: input.academicYear,
            period: input.period || null,
            description: input.description || null,
            searchKey: searchKey(input.name, input.code),
            subjectId: input.subjectId ?? null,
            startsOn: toDbDate(input.startsOn),
            endsOn: toDbDate(input.endsOn),
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
        // The contract sends both dates or neither, so the pair stays consistent.
        const offering = {
          subjectId: input.subjectId === undefined ? current.subjectId : input.subjectId,
          period: next.period,
          startsOn: input.startsOn === undefined ? isoDate(current.startsOn) : input.startsOn,
          endsOn: input.endsOn === undefined ? isoDate(current.endsOn) : input.endsOn,
        };
        const currentOffering = {
          subjectId: current.subjectId,
          period: current.period,
          startsOn: isoDate(current.startsOn),
          endsOn: isoDate(current.endsOn),
        };
        const fields = EDITABLE_FIELDS.filter((field) => next[field] !== current[field]);
        const offeringFields = OFFERING_FIELDS.filter((field) => offering[field] !== currentOffering[field]);
        if (fields.length === 0 && offeringFields.length === 0) return this.get(auth.userId, classId, tx);

        // SUBJECT_INACTIVE only when the subject changes: a class keeps its inactive subject.
        if (offering.subjectId && offeringFields.includes("subjectId")) {
          await this.assertSubjectOffered(tx, auth.userId, offering.subjectId);
        }
        if (offeringFields.includes("startsOn") || offeringFields.includes("endsOn")) {
          await this.assertMeetingsInside(tx, classId, offering.startsOn, offering.endsOn);
        }

        await tx.schoolClass.update({
          where: { id: classId },
          data: {
            ...next,
            searchKey: searchKey(next.name, next.code),
            subjectId: offering.subjectId,
            startsOn: toDbDate(offering.startsOn),
            endsOn: toDbDate(offering.endsOn),
          },
        });
        if (fields.length > 0) {
          await this.audit.record(tx, {
            type: "class.updated",
            actorType: "USER",
            actorUserId: auth.userId,
            targetType: "CLASS",
            targetId: classId,
            requestId,
            metadata: { fields },
          });
        }
        if (offeringFields.length > 0) {
          await this.audit.record(tx, {
            type: "class.offering_updated",
            actorType: "USER",
            actorUserId: auth.userId,
            targetType: "CLASS",
            targetId: classId,
            requestId,
            metadata: { fields: offeringFields, subjectId: offering.subjectId },
          });
        }
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

  /**
   * The subject chosen for a class must be the teacher's (404 otherwise, E3) and ACTIVE (409
   * SUBJECT_INACTIVE, US1-6).
   */
  private async assertSubjectOffered(tx: Tx, teacherId: string, subjectId: string): Promise<void> {
    const subject = await this.subjects.findOwnedOrNotFound(teacherId, subjectId, tx);
    if (subject.status !== "ACTIVE") throw subjectInactive();
  }

  /**
   * New dates must keep every meeting of the class inside the period (004/US4-7, research E12):
   * otherwise `409 MEETINGS_OUTSIDE_PERIOD`, and the teacher removes those meetings through the
   * calendar first, resolving their topics there. Clearing the dates counts every meeting.
   */
  private async assertMeetingsInside(tx: Tx, classId: string, startsOn: string | null, endsOn: string | null) {
    const outside = await tx.classMeeting.count({
      where: {
        classId,
        ...(startsOn && endsOn ? { OR: [{ meetingDate: { lt: toDbDate(startsOn)! } }, { meetingDate: { gt: toDbDate(endsOn)! } }] } : {}),
      },
    });
    if (outside > 0) throw meetingsOutsidePeriod();
  }

  /** Locks the teacher's class row for the rest of the transaction; 404 outside the teacher's context. */
  private async lockOwned(tx: Tx, teacherId: string, classId: string) {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM classes WHERE id = ${classId}::uuid AND teacher_id = ${teacherId}::uuid FOR UPDATE`;
    if (!locked) throw notFound();
    return this.context.findOwnedOrNotFound(teacherId, classId, tx);
  }
}
