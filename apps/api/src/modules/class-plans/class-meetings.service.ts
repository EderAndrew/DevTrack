import { Injectable } from "@nestjs/common";
import {
  type ClassMeetingList,
  type DayKind,
  DayKindSchema,
  MAX_MEETINGS_PER_CLASS,
  type TopicResolution,
  type UpdateClassMeetingsRequest,
} from "@repo/contracts";
import type { ClassPlan, Topic } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import {
  invalidStateTransition,
  meetingHasTopics,
  meetingOutOfPeriod,
  notFound,
  planRevisionConflict,
  tooManyMeetings,
  validationError,
} from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { isoDate } from "../classes/class.view";
import { requirePlannable } from "../classes/plannable-class";
import { type DayWrite, type SavedCalendar, diffCalendar, meetingTotalAfter } from "./calendar-diff";
import { dayViews, meetingViews } from "./class-plan.view";
import { lockOwnedClass } from "./owned-class-lock";
import { bumpRevision } from "./plan-revision.guard";
import { type TopicActor, TopicMutations } from "./topic-mutations";

type ResolutionAction = TopicResolution["action"];

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

const dayData = (day: DayWrite) => ({
  dayDate: toDbDate(day.date),
  kind: day.kind,
  description: day.description,
  absenceReason: day.absenceReason,
  absenceNotice: day.absenceNotice,
});

/**
 * The class calendar (004 US4, FR-025 – FR-030, research E12). A meeting is a date of the class;
 * its number is derived from the date order on read, never stored. 031: each mark has a kind — the five meeting kinds
 * in `class_meetings`, the days without class in `class_calendar_days` — and a save adds, sets and removes marks in
 * one transaction (`calendar-diff.ts`); a removed meeting's non-archived topics must each have a resolution, which
 * is applied first, so no topic is ever deleted or left pointing at a missing meeting (SC-008).
 */
@Injectable()
export class ClassMeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
    private readonly topics: TopicMutations,
    private readonly audit: AuditService,
  ) {}

  async list(teacherId: string, classId: string): Promise<ClassMeetingList> {
    requirePlannable(await this.context.findOwnedOrNotFound(teacherId, classId));
    return this.view(this.prisma, classId);
  }

  async update(
    auth: AuthContext,
    classId: string,
    input: UpdateClassMeetingsRequest,
    requestId: string | null,
  ): Promise<ClassMeetingList> {
    return this.prisma.runInTransaction(async (tx) => {
      const schoolClass = requirePlannable(await lockOwnedClass(tx, this.context, auth.userId, classId), "write");
      const plan = await tx.classPlan.findUnique({ where: { classId } });
      // With a plan, `planRevision` is required (null never matches); without one it must be null.
      if (plan) await bumpRevision(tx, plan.id, input.planRevision ?? 0);
      else if (input.planRevision !== null) throw planRevisionConflict();

      // 031 CK3: the saved marks (meetings and days without class), read under the class lock, and the writes.
      const saved = await this.savedCalendar(tx, classId);
      const result = diffCalendar(saved, input);
      if (!result.ok) throw validationError();
      const { diff } = result;

      const startsOn = isoDate(schoolClass.startsOn)!;
      const endsOn = isoDate(schoolClass.endsOn)!;
      const marked = [...input.add, ...input.set.map((entry) => entry.date)];
      if (marked.some((date) => date < startsOn || date > endsOn)) throw meetingOutOfPeriod();
      const total = meetingTotalAfter(saved, diff);
      if (total > MAX_MEETINGS_PER_CLASS) throw tooManyMeetings();

      // Days becoming meetings (or removed) go first, so the cross-table trigger (CK2) never sees two marks on a date.
      if (diff.deleteDays.length > 0) {
        await tx.classCalendarDay.deleteMany({ where: { classId, dayDate: { in: diff.deleteDays.map(toDbDate) } } });
      }
      if (diff.createMeetings.length > 0) {
        await tx.classMeeting.createMany({
          data: diff.createMeetings.map((meeting) => ({
            classId,
            meetingDate: toDbDate(meeting.date),
            kind: meeting.kind,
            description: meeting.description,
          })),
        });
      }
      for (const meeting of diff.updateMeetings) {
        await tx.classMeeting.update({
          where: { id: meeting.id },
          data: { kind: meeting.kind, description: meeting.description },
        });
      }

      const leaving = new Set(diff.leavingMeetingIds);
      const kept = await this.meetingIdsByDate(tx, classId);
      for (const [date, id] of kept) if (leaving.has(id)) kept.delete(date);

      const actor: TopicActor = { userId: auth.userId, requestId };
      const resolutions = await this.resolve(tx, actor, plan, input.resolutions, leaving, kept);

      if (leaving.size > 0) {
        const ids = [...leaving];
        const unresolved = await tx.topic.count({ where: { meetingId: { in: ids }, status: { not: "ARCHIVED" } } });
        if (unresolved > 0) throw meetingHasTopics();
        // Archived topics (just archived or merged, or archived before) let go of the meeting.
        await tx.topic.updateMany({ where: { meetingId: { in: ids } }, data: { meetingId: null } });
        await tx.classMeeting.deleteMany({ where: { id: { in: ids } } });
      }

      // Meetings becoming days were deleted above, so these dates are free now.
      if (diff.createDays.length > 0) {
        await tx.classCalendarDay.createMany({ data: diff.createDays.map((day) => ({ classId, ...dayData(day) })) });
      }
      for (const day of diff.updateDays) {
        await tx.classCalendarDay.update({
          where: { classId_dayDate: { classId, dayDate: toDbDate(day.date) } },
          data: dayData(day),
        });
      }

      if (diff.added > 0 || diff.removed > 0 || diff.changed > 0 || input.resolutions.length > 0) {
        await this.audit.record(tx, {
          type: "class_meetings.updated",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "CLASS",
          targetId: classId,
          requestId,
          // Counts only, never a description, reason or notice (031 CK11).
          metadata: {
            added: diff.added,
            removed: diff.removed,
            total,
            resolutions,
            kinds: await this.kindCounts(tx, classId),
            changed: diff.changed,
          },
        });
      }
      return this.view(tx, classId);
    });
  }

  /**
   * Applies what the teacher chose for each topic of a removed meeting (FR-029): MOVE and
   * UNSCHEDULE first, then MERGE, then ARCHIVE. Returns the count per action for the audit.
   * A topic outside the class's plan (or archived) → 404; a topic that is not on a removed
   * meeting, a repeated topic, a merge into itself or into a topic leaving in the same save, or a
   * MOVE to a date the calendar will not have → 400.
   */
  private async resolve(
    tx: Tx,
    actor: TopicActor,
    plan: ClassPlan | null,
    resolutions: TopicResolution[],
    removedIds: Set<string>,
    keptByDate: Map<string, string>,
  ): Promise<Partial<Record<ResolutionAction, number>>> {
    if (resolutions.length === 0) return {};
    const topicIds = resolutions.map((resolution) => resolution.topicId);
    if (new Set(topicIds).size !== topicIds.length) throw validationError();

    const intoIds = resolutions.flatMap((resolution) => (resolution.action === "MERGE" ? [resolution.intoTopicId] : []));
    const wanted = [...new Set([...topicIds, ...intoIds])];
    const found = plan
      ? await tx.topic.findMany({ where: { planId: plan.id, id: { in: wanted }, status: { not: "ARCHIVED" } } })
      : [];
    const byId = new Map(found.map((topic) => [topic.id, topic]));
    if (wanted.some((id) => !byId.has(id))) throw notFound();

    const leaving = new Set(
      resolutions.filter((r) => r.action === "MERGE" || r.action === "ARCHIVE").map((resolution) => resolution.topicId),
    );
    for (const resolution of resolutions) {
      const topic = byId.get(resolution.topicId)!;
      if (!topic.meetingId || !removedIds.has(topic.meetingId)) throw validationError();
      if (resolution.action === "MERGE" && (resolution.intoTopicId === topic.id || leaving.has(resolution.intoTopicId))) {
        throw validationError();
      }
      if (resolution.action === "MOVE" && !keptByDate.has(resolution.meetingDate)) throw validationError();
      // A completed topic is only archived, and nothing is merged into it (FR-057).
      const into = resolution.action === "MERGE" ? byId.get(resolution.intoTopicId)! : null;
      if ((topic.status === "COMPLETED" && resolution.action !== "ARCHIVE") || into?.status === "COMPLETED") {
        throw invalidStateTransition();
      }
    }

    const counts: Partial<Record<ResolutionAction, number>> = {};
    const count = (action: ResolutionAction) => (counts[action] = (counts[action] ?? 0) + 1);
    for (const resolution of resolutions) {
      const topic = byId.get(resolution.topicId)!;
      if (resolution.action === "MOVE") {
        await this.topics.moveToMeeting(tx, actor, topic, keptByDate.get(resolution.meetingDate)!);
        count("MOVE");
      } else if (resolution.action === "UNSCHEDULE") {
        await this.topics.unschedule(tx, actor, topic);
        count("UNSCHEDULE");
      }
    }
    const mergesByTarget = new Map<string, Topic[]>();
    for (const resolution of resolutions) {
      if (resolution.action !== "MERGE") continue;
      mergesByTarget.set(resolution.intoTopicId, [
        ...(mergesByTarget.get(resolution.intoTopicId) ?? []),
        byId.get(resolution.topicId)!,
      ]);
      count("MERGE");
    }
    for (const [targetId, sources] of mergesByTarget) await this.topics.mergeInto(tx, actor, byId.get(targetId)!, sources);
    for (const resolution of resolutions) {
      if (resolution.action !== "ARCHIVE") continue;
      await this.topics.archive(tx, actor, byId.get(resolution.topicId)!, "MEETING_REMOVED");
      count("ARCHIVE");
    }
    return counts;
  }

  /** 031: the meetings and the days without class of the class by "YYYY-MM-DD". */
  private async savedCalendar(tx: Tx, classId: string): Promise<SavedCalendar> {
    const meetings = await tx.classMeeting.findMany({
      where: { classId },
      select: { id: true, meetingDate: true, kind: true, description: true },
    });
    const days = await tx.classCalendarDay.findMany({
      where: { classId },
      select: { dayDate: true, kind: true, description: true, absenceReason: true, absenceNotice: true },
    });
    return {
      meetings: new Map(
        meetings.map((row) => [isoDate(row.meetingDate)!, { id: row.id, kind: row.kind, description: row.description }]),
      ),
      days: new Map(
        days.map((row) => [
          isoDate(row.dayDate)!,
          { kind: row.kind, description: row.description, absenceReason: row.absenceReason, absenceNotice: row.absenceNotice },
        ]),
      ),
    };
  }

  /** 031 CK11: the count per kind of every mark after the save, the nine keys. */
  private async kindCounts(tx: Tx, classId: string): Promise<Record<DayKind, number>> {
    const counts = Object.fromEntries(DayKindSchema.options.map((kind) => [kind, 0])) as Record<DayKind, number>;
    const meetings = await tx.classMeeting.groupBy({ by: ["kind"], where: { classId }, _count: { _all: true } });
    const days = await tx.classCalendarDay.groupBy({ by: ["kind"], where: { classId }, _count: { _all: true } });
    for (const row of [...meetings, ...days]) counts[row.kind] = row._count._all;
    return counts;
  }

  /** Meeting ids of the class by "YYYY-MM-DD". */
  private async meetingIdsByDate(tx: Tx, classId: string): Promise<Map<string, string>> {
    const rows = await tx.classMeeting.findMany({ where: { classId }, select: { id: true, meetingDate: true } });
    return new Map(rows.map((row) => [isoDate(row.meetingDate)!, row.id]));
  }

  /** The list with numbers by date order (`row_number()`, E12) and each meeting's non-archived topics. */
  private async view(db: Tx | PrismaService, classId: string): Promise<ClassMeetingList> {
    const items = await meetingViews(db, classId);
    const days = await dayViews(db, classId);
    const plan = await db.classPlan.findUnique({ where: { classId }, select: { revision: true } });
    return { items, days, total: items.length, planRevision: plan?.revision ?? null };
  }
}
