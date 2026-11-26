import { Inject, Injectable } from "@nestjs/common";
import type {
  ClassListQuery,
  ClassPage,
  ClassStatus,
  ClassView,
  CreateClassRequest,
  UpdateClassRequest,
} from "@repo/contracts";
import { Prisma } from "../../generated/prisma/client";
import { CLOCK, type Clock } from "../../platform/clock/clock";
import { afterCursor, decodeCursor, encodeCursor, escapeLike } from "../../platform/database/keyset";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import {
  classCalendarNotEnded,
  classSubjectDuplicate,
  cohortNotActive,
  invalidStateTransition,
  meetingsOutsidePeriod,
  notFound,
  subjectInactive,
} from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { searchKey } from "../../platform/text/search-key";
import { AuditService } from "../audit/audit.service";
import { planningToday } from "../class-plans/planning-date";
import { SubjectContextPolicy } from "../subjects/subject-context.policy";
import { ClassContextPolicy } from "./class-context.policy";
import { ClassStateMachine } from "./class.state-machine";
import { canCloseClass } from "./close-rule";
import { CLASS_VIEW_SELECT, isoDate, toClassView } from "./class.view";

export const CLASSES_PAGE_SIZE = 20;

/** Statuses listed when the filter is absent (FR-007): archived classes only on request. */
const DEFAULT_STATUSES: ClassStatus[] = ["ACTIVE", "INACTIVE"];

/** The calendar dates, the only fields a teacher edits (027 FR-019: the turma and the subject never change). */
type OfferingField = "startsOn" | "endsOn";
const OFFERING_FIELDS: readonly OfferingField[] = ["startsOn", "endsOn"];

/** The only unique index a create can hit is `classes_cohort_subject_key` (FR-018). */
const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

/** A `@db.Date` value from the contract's "YYYY-MM-DD" (null stays null). */
const toDbDate = (value: string | null | undefined) => (value ? new Date(`${value}T00:00:00.000Z`) : null);

/**
 * A teacher's classes (003 US1, FR-001–FR-008). The teacher always comes from the session,
 * never from the request; every lookup by id goes through `ClassContextPolicy`, so another
 * teacher's class is a plain 404 (D7).
 *
 * 027: a class is the disciplina da turma; its turma's data come from the cohort. The teacher creates one by
 * adding an own ACTIVE subject to an ACTIVE turma (US3, research Q10); the edit takes only the calendar dates (FR-019); the status route changes only the class's own status and
 * no longer touches invitations, which belong to the cohort.
 */
@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
    private readonly subjects: SubjectContextPolicy,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private today(): string {
    return planningToday(this.clock.now());
  }

  /** Keyset page, newest first; search on `search_key` ignores case and accents (D10). */
  async list(teacherId: string, { query, year, status, subjectId, cursor }: ClassListQuery): Promise<ClassPage> {
    const after = cursor ? decodeCursor(cursor) : null;
    const term = query ? searchKey(query) : "";
    const rows = await this.prisma.schoolClass.findMany({
      where: {
        teacherId,
        status: status ?? { in: DEFAULT_STATUSES },
        ...(year !== undefined || term
          ? {
              cohort: {
                ...(year !== undefined ? { academicYear: year } : {}),
                ...(term ? { searchKey: { contains: escapeLike(term) } } : {}),
              },
            }
          : {}),
        ...(subjectId ? { subjectId } : {}),
        ...(after ? { AND: [afterCursor(after)] } : {}),
      },
      select: CLASS_VIEW_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: CLASSES_PAGE_SIZE + 1,
    });
    const page = rows.slice(0, CLASSES_PAGE_SIZE);
    return {
      items: page.map((row) => toClassView(row, this.today())),
      nextCursor: rows.length > CLASSES_PAGE_SIZE ? encodeCursor(page.at(-1)!) : null,
    };
  }

  async get(teacherId: string, classId: string, db: Tx = this.prisma): Promise<ClassView> {
    const row = await db.schoolClass.findFirst({ where: { id: classId, teacherId }, select: CLASS_VIEW_SELECT });
    if (!row) throw notFound();
    return toClassView(row, this.today());
  }

  /**
   * 027 FR-017/FR-018, research Q10: the subject must be the teacher's (else 404) and ACTIVE (`409
   * SUBJECT_INACTIVE`); the turma must exist (404) and be ACTIVE (`409 COHORT_NOT_ACTIVE`), read under
   * `FOR SHARE` so a concurrent archive (`FOR UPDATE`) waits for this insert or makes it see the archive; a second
   * disciplina with the same subject in the turma hits the partial UNIQUE → `409 CLASS_SUBJECT_DUPLICATE`.
   */
  async create(auth: AuthContext, input: CreateClassRequest, requestId: string | null): Promise<ClassView> {
    try {
      return await this.prisma.runInTransaction(async (tx) => {
        await this.assertSubjectOffered(tx, auth.userId, input.subjectId);
        const [cohort] = await tx.$queryRaw<{ status: ClassStatus }[]>`
          SELECT status FROM cohorts WHERE id = ${input.cohortId}::uuid FOR SHARE`;
        if (!cohort) throw notFound();
        if (cohort.status !== "ACTIVE") throw cohortNotActive();

        const row = await tx.schoolClass.create({
          data: {
            teacherId: auth.userId,
            cohortId: input.cohortId,
            subjectId: input.subjectId,
            startsOn: toDbDate(input.startsOn),
            endsOn: toDbDate(input.endsOn),
          },
          select: { id: true },
        });
        await this.audit.record(tx, {
          type: "class.created",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "CLASS",
          targetId: row.id,
          requestId,
          metadata: { cohortId: input.cohortId, subjectId: input.subjectId },
        });
        return this.get(auth.userId, row.id, tx);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw classSubjectDuplicate();
      throw error;
    }
  }

  /** Edits the calendar of an ACTIVE or INACTIVE class (004 rules); the audit keeps the changed fields only. */
  async update(auth: AuthContext, classId: string, input: UpdateClassRequest, requestId: string | null): Promise<ClassView> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockOwned(tx, auth.userId, classId);
      if (current.status === "ARCHIVED") throw invalidStateTransition();
      const offering = { startsOn: input.startsOn, endsOn: input.endsOn };
      const currentOffering = { startsOn: isoDate(current.startsOn), endsOn: isoDate(current.endsOn) };
      const offeringFields = OFFERING_FIELDS.filter((field) => offering[field] !== currentOffering[field]);
      if (offeringFields.length === 0) return this.get(auth.userId, classId, tx);

      await this.assertMeetingsInside(tx, classId, offering.startsOn, offering.endsOn);
      const calendarDaysRemoved = await this.removeDaysOutside(tx, classId, offering.startsOn, offering.endsOn);
      await tx.schoolClass.update({
        where: { id: classId },
        data: { startsOn: toDbDate(offering.startsOn), endsOn: toDbDate(offering.endsOn) },
      });
      await this.audit.record(tx, {
        type: "class.offering_updated",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "CLASS",
        targetId: classId,
        requestId,
        metadata: { fields: offeringFields, subjectId: current.subjectId, calendarDaysRemoved },
      });
      return this.get(auth.userId, classId, tx);
    });
  }

  /**
   * 027 FR-022, research Q5: the teacher changes the class's **own** status only after the last day of its calendar
   * (`canCloseClass` with "today" of the injected clock in America/Sao_Paulo; without a calendar never →
   * `409 CLASS_CALENDAR_NOT_ENDED`); a class of an ARCHIVED cohort never changes (`409 INVALID_STATE_TRANSITION`).
   * Then, as in 003 FR-004, the same status is a no-op and any other change follows `ClassStateMachine` (ARCHIVED is
   * final). The invitations belong to the cohort, so nothing else changes here.
   */
  async changeStatus(auth: AuthContext, classId: string, to: ClassStatus, requestId: string | null): Promise<ClassView> {
    return this.prisma.runInTransaction(async (tx) => {
      const current = await this.lockOwned(tx, auth.userId, classId);
      if (current.cohort.status === "ARCHIVED") throw invalidStateTransition();
      if (!canCloseClass(current, this.today())) throw classCalendarNotEnded();
      if (current.ownStatus === to) return this.get(auth.userId, classId, tx);
      ClassStateMachine.assertTransition(current.ownStatus, to);

      await tx.schoolClass.update({ where: { id: classId }, data: { status: to, statusChangedAt: this.clock.now() } });
      await this.audit.record(tx, {
        type: "class.status_changed",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "CLASS",
        targetId: classId,
        requestId,
        metadata: { from: current.ownStatus, to },
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

  /**
   * 031/FR-009, research CK5: the days without class (holidays, events, absences) outside the new period are deleted with
   * the change — all of them when the dates are cleared; they carry no topics, so nothing needs resolving.
   */
  private async removeDaysOutside(tx: Tx, classId: string, startsOn: string | null, endsOn: string | null) {
    const { count } = await tx.classCalendarDay.deleteMany({
      where: {
        classId,
        ...(startsOn && endsOn ? { OR: [{ dayDate: { lt: toDbDate(startsOn)! } }, { dayDate: { gt: toDbDate(endsOn)! } }] } : {}),
      },
    });
    return count;
  }

  /** Locks the teacher's class row for the rest of the transaction; 404 outside the teacher's context. */
  private async lockOwned(tx: Tx, teacherId: string, classId: string) {
    const [locked] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM classes WHERE id = ${classId}::uuid AND teacher_id = ${teacherId}::uuid FOR UPDATE`;
    if (!locked) throw notFound();
    return this.context.findOwnedOrNotFound(teacherId, classId, tx);
  }
}
