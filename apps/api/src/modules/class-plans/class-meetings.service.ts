import { Injectable } from "@nestjs/common";
import {
  type ClassMeetingList,
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
import { meetingViews } from "./class-plan.view";
import { lockOwnedClass } from "./owned-class-lock";
import { bumpRevision } from "./plan-revision.guard";
import { type TopicActor, TopicMutations } from "./topic-mutations";

type ResolutionAction = TopicResolution["action"];

const toDbDate = (date: string) => new Date(`${date}T00:00:00.000Z`);

/**
 * The class calendar (004 US4, FR-025 – FR-030, research E12). A meeting is a date of the class;
 * its number is derived from the date order on read, never stored. Saving adds and removes dates
 * in one transaction; a removed meeting's non-archived topics must each have a resolution, which
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
    const add = [...new Set(input.add)];
    const remove = [...new Set(input.remove)];
    if (add.some((date) => remove.includes(date))) throw validationError();

    return this.prisma.runInTransaction(async (tx) => {
      const schoolClass = requirePlannable(await lockOwnedClass(tx, this.context, auth.userId, classId), "write");
      const plan = await tx.classPlan.findUnique({ where: { classId } });
      // With a plan, `planRevision` is required (null never matches); without one it must be null.
      if (plan) await bumpRevision(tx, plan.id, input.planRevision ?? 0);
      else if (input.planRevision !== null) throw planRevisionConflict();

      const startsOn = isoDate(schoolClass.startsOn)!;
      const endsOn = isoDate(schoolClass.endsOn)!;
      if (add.some((date) => date < startsOn || date > endsOn)) throw meetingOutOfPeriod();

      const existing = await this.meetingIdsByDate(tx, classId);
      const added = add.filter((date) => !existing.has(date));
      const removedIds = remove.flatMap((date) => existing.get(date) ?? []);
      const total = existing.size + added.length - removedIds.length;
      if (total > MAX_MEETINGS_PER_CLASS) throw tooManyMeetings();

      if (added.length > 0) {
        await tx.classMeeting.createMany({ data: added.map((date) => ({ classId, meetingDate: toDbDate(date) })) });
      }
      const kept = await this.meetingIdsByDate(tx, classId);
      for (const date of remove) kept.delete(date);

      const actor: TopicActor = { userId: auth.userId, requestId };
      const resolutions = await this.resolve(tx, actor, plan, input.resolutions, new Set(removedIds), kept);

      if (removedIds.length > 0) {
        const unresolved = await tx.topic.count({ where: { meetingId: { in: removedIds }, status: { not: "ARCHIVED" } } });
        if (unresolved > 0) throw meetingHasTopics();
        // Archived topics (just archived or merged, or archived before) let go of the meeting.
        await tx.topic.updateMany({ where: { meetingId: { in: removedIds } }, data: { meetingId: null } });
        await tx.classMeeting.deleteMany({ where: { id: { in: removedIds } } });
      }

      if (added.length > 0 || removedIds.length > 0 || input.resolutions.length > 0) {
        await this.audit.record(tx, {
          type: "class_meetings.updated",
          actorType: "USER",
          actorUserId: auth.userId,
          targetType: "CLASS",
          targetId: classId,
          requestId,
          metadata: { added: added.length, removed: removedIds.length, total, resolutions },
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

  /** Meeting ids of the class by "YYYY-MM-DD". */
  private async meetingIdsByDate(tx: Tx, classId: string): Promise<Map<string, string>> {
    const rows = await tx.classMeeting.findMany({ where: { classId }, select: { id: true, meetingDate: true } });
    return new Map(rows.map((row) => [isoDate(row.meetingDate)!, row.id]));
  }

  /** The list with numbers by date order (`row_number()`, E12) and each meeting's non-archived topics. */
  private async view(db: Tx | PrismaService, classId: string): Promise<ClassMeetingList> {
    const items = await meetingViews(db, classId);
    const plan = await db.classPlan.findUnique({ where: { classId }, select: { revision: true } });
    return { items, total: items.length, planRevision: plan?.revision ?? null };
  }
}
