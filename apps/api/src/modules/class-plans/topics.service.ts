import { Injectable } from "@nestjs/common";
import {
  type ClassPlanView,
  type CreateTopicRequest,
  MAX_TOPICS_PER_PLAN,
  type MergeTopicsRequest,
  type ReorderTopicsRequest,
  type SplitTopicRequest,
  type TopicFields,
  type TopicList,
  type UpdateTopicRequest,
} from "@repo/contracts";
import type { ClassPlan, ClassPlanStatus, Topic } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import {
  invalidStateTransition,
  notFound,
  syllabusItemNotInPlan,
  syllabusRequired,
  tooManyTopics,
  validationError,
} from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import type { AuditEventType, AuditMetadata } from "../audit/audit-event-types";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { requirePlannable } from "../classes/plannable-class";
import { classPlanView, topicViews } from "./class-plan.view";
import { bumpRevision } from "./plan-revision.guard";
import { type TopicActor, TopicMutations } from "./topic-mutations";
import { TopicStateMachine } from "./topic.state-machine";

/** A plan open for writing: its revision was just bumped, so it is not archived. */
type OpenPlan = ClassPlan & { status: Exclude<ClassPlanStatus, "ARCHIVED"> };

interface WriteContext {
  tx: Tx;
  plan: OpenPlan;
  actor: TopicActor;
  classId: string;
  teacherId: string;
}

/** The topic fields that changed, in the order of the form (audit `fields`). */
const EDITABLE: readonly (keyof TopicFields)[] = ["title", "description", "meetingId", "itemIds"];

/**
 * Topics of a class plan (004 US5, US6, FR-032 – FR-038, research E14). Every write starts with
 * `bumpRevision` (E13) and returns the updated `ClassPlanView`. Topics are created by the teacher
 * (`MANUAL`; `GENERATED` is reserved for AI generation) and never deleted, only archived.
 */
@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
    private readonly mutations: TopicMutations,
    private readonly audit: AuditService,
  ) {}

  /** Archived topics of the plan, by position ("Tópicos arquivados"); a class without a plan → 404. */
  async listArchived(teacherId: string, classId: string): Promise<TopicList> {
    await this.context.findOwnedOrNotFound(teacherId, classId);
    const plan = await this.prisma.classPlan.findUnique({ where: { classId } });
    if (!plan) throw notFound();
    return { items: await topicViews(this.prisma, plan, true) };
  }

  /**
   * Creates a topic at the end of the plan: DRAFT while the plan is a draft, ACTIVE once it is
   * READY or ACTIVE (FR-039). No plan → 422 SYLLABUS_REQUIRED (FR-032); a meeting of another
   * class or an item of another teacher → 404; an item outside the revision in use → 422.
   */
  create(auth: AuthContext, classId: string, input: CreateTopicRequest, requestId: string | null): Promise<ClassPlanView> {
    return this.write(auth, classId, input.planRevision, requestId, async (ctx) => {
      await this.assertRoomFor(ctx, 1);
      const meetingId = await this.meetingOf(ctx, input.meetingId);
      await this.assertItems(ctx, input.itemIds, []);
      const topic = await ctx.tx.topic.create({
        data: {
          ...this.newTopicData(ctx, input, meetingId),
          position: (await this.lastPosition(ctx)) + 1,
          status: TopicStateMachine.initialStatus(ctx.plan.status),
        },
      });
      await this.record(ctx, "topic.created", topic.id, {
        planId: ctx.plan.id,
        itemCount: input.itemIds.length,
        hasMeeting: meetingId !== null,
      });
    });
  }

  /**
   * Edits title, description, meeting and items (FR-035). An archived topic → 409; items must be
   * in the revision in use, except those the topic already has (kept after a switch, E16).
   */
  update(auth: AuthContext, classId: string, topicId: string, input: UpdateTopicRequest, requestId: string | null): Promise<ClassPlanView> {
    return this.write(auth, classId, input.planRevision, requestId, async (ctx) => {
      const topic = await this.activeTopic(ctx, topicId);
      const links = await this.itemIdsOf(ctx.tx, [topic.id]);
      const next = {
        title: input.title ?? topic.title,
        description: input.description === undefined ? topic.description : input.description || null,
        meetingId: input.meetingId === undefined ? topic.meetingId : await this.meetingOf(ctx, input.meetingId),
        itemIds: input.itemIds ?? links,
      };
      if (input.itemIds) await this.assertItems(ctx, input.itemIds, links);
      const current = { title: topic.title, description: topic.description, meetingId: topic.meetingId, itemIds: links };
      const fields = EDITABLE.filter((field) =>
        field === "itemIds" ? !sameSet(next.itemIds, current.itemIds) : next[field] !== current[field],
      );
      if (fields.length === 0) return;

      await ctx.tx.topic.update({
        where: { id: topic.id },
        data: { title: next.title, description: next.description, meetingId: next.meetingId, updatedById: ctx.teacherId },
      });
      if (fields.includes("itemIds")) await this.replaceItems(ctx.tx, topic.id, next.itemIds);
      await this.record(ctx, "topic.updated", topic.id, { planId: ctx.plan.id, fields });
    });
  }

  /**
   * "Juntar tópicos" (FR-036): the first topic stays with the reviewed fields and items; the
   * others (non-archived, same plan) are archived pointing at it. One `topic.merged`.
   */
  merge(auth: AuthContext, classId: string, input: MergeTopicsRequest, requestId: string | null): Promise<ClassPlanView> {
    return this.write(auth, classId, input.planRevision, requestId, async (ctx) => {
      const topics = await ctx.tx.topic.findMany({ where: { planId: ctx.plan.id, id: { in: input.topicIds } } });
      if (topics.length !== input.topicIds.length) throw notFound();
      if (topics.some((topic) => topic.status === "ARCHIVED")) throw invalidStateTransition();
      const byId = new Map(topics.map((topic) => [topic.id, topic]));
      const [target, ...sources] = input.topicIds.map((id) => byId.get(id)!);

      const meetingId = await this.meetingOf(ctx, input.meetingId);
      await this.assertItems(ctx, input.itemIds, await this.itemIdsOf(ctx.tx, input.topicIds));
      await ctx.tx.topic.update({
        where: { id: target!.id },
        data: { title: input.title, description: input.description || null, meetingId },
      });
      await this.replaceItems(ctx.tx, target!.id, input.itemIds);
      await this.mutations.mergeInto(ctx.tx, ctx.actor, target!, sources, false);
    });
  }

  /**
   * "Dividir tópico" (FR-037): the topic becomes the first part; the others are created right
   * after it with its status and `splitFromTopicId` (positions shift under the deferred unique
   * constraint, E14). An item may be in several parts.
   */
  split(auth: AuthContext, classId: string, topicId: string, input: SplitTopicRequest, requestId: string | null): Promise<ClassPlanView> {
    return this.write(auth, classId, input.planRevision, requestId, async (ctx) => {
      const topic = await this.activeTopic(ctx, topicId);
      const [first, ...rest] = input.parts;
      await this.assertRoomFor(ctx, rest.length);
      const links = await this.itemIdsOf(ctx.tx, [topic.id]);
      const meetings = [];
      for (const part of input.parts) {
        meetings.push(await this.meetingOf(ctx, part.meetingId));
        await this.assertItems(ctx, part.itemIds, links);
      }

      await ctx.tx.topic.update({
        where: { id: topic.id },
        data: { title: first!.title, description: first!.description || null, meetingId: meetings[0], updatedById: ctx.teacherId },
      });
      await this.replaceItems(ctx.tx, topic.id, first!.itemIds);
      await ctx.tx.$executeRaw`
        UPDATE topics SET position = position + ${rest.length}
        WHERE plan_id = ${ctx.plan.id}::uuid AND position > ${topic.position}`;
      const newTopicIds: string[] = [];
      for (const [index, part] of rest.entries()) {
        const created = await ctx.tx.topic.create({
          data: {
            ...this.newTopicData(ctx, part, meetings[index + 1]!),
            position: topic.position + index + 1,
            status: topic.status,
            splitFromTopicId: topic.id,
          },
        });
        newTopicIds.push(created.id);
      }
      await this.record(ctx, "topic.split", topic.id, { planId: ctx.plan.id, newTopicIds });
    });
  }

  /** Archives the topic (FR-038): it leaves the plan and its items show as not covered. */
  archive(auth: AuthContext, classId: string, topicId: string, planRevision: number, requestId: string | null): Promise<ClassPlanView> {
    return this.write(auth, classId, planRevision, requestId, async (ctx) => {
      await this.mutations.archive(ctx.tx, ctx.actor, await this.topicOf(ctx, topicId), "TEACHER");
    });
  }

  /**
   * Restores an archived topic to the status it had, or ACTIVE once the plan was confirmed (E14).
   * Not archived → 409; the plan already has 300 non-archived topics → 422.
   */
  restore(auth: AuthContext, classId: string, topicId: string, planRevision: number, requestId: string | null): Promise<ClassPlanView> {
    return this.write(auth, classId, planRevision, requestId, async (ctx) => {
      const topic = await this.topicOf(ctx, topicId);
      if (topic.status !== "ARCHIVED") throw invalidStateTransition();
      await this.assertRoomFor(ctx, 1);
      const status = TopicStateMachine.restoredStatus(topic.statusBeforeArchive, ctx.plan.status);
      await ctx.tx.topic.update({
        where: { id: topic.id },
        data: { status, statusBeforeArchive: null, archivedAt: null, mergedIntoTopicId: null, updatedById: ctx.teacherId },
      });
      await this.record(ctx, "topic.restored", topic.id, { planId: ctx.plan.id, status });
    });
  }

  /**
   * Saves the order and the meetings of every non-archived topic in one write (FR-035, E14):
   * positions 1..N as sent, archived topics after, in the order they had. The list must hold each
   * non-archived topic exactly once (else 400); a meeting of another class → 404.
   */
  reorder(auth: AuthContext, classId: string, input: ReorderTopicsRequest, requestId: string | null): Promise<ClassPlanView> {
    return this.write(auth, classId, input.planRevision, requestId, async (ctx) => {
      const topics = await ctx.tx.topic.findMany({ where: { planId: ctx.plan.id }, orderBy: { position: "asc" } });
      const active = topics.filter((topic) => topic.status !== "ARCHIVED");
      const byId = new Map(active.map((topic) => [topic.id, topic]));
      if (input.items.length !== active.length || input.items.some((item) => !byId.has(item.topicId))) {
        throw validationError();
      }
      const meetingIds = [...new Set(input.items.flatMap((item) => (item.meetingId ? [item.meetingId] : [])))];
      const found = await ctx.tx.classMeeting.count({ where: { classId: ctx.classId, id: { in: meetingIds } } });
      if (found !== meetingIds.length) throw notFound();

      const order = [
        ...input.items.map((item) => ({ topic: byId.get(item.topicId)!, meetingId: item.meetingId })),
        ...topics.filter((topic) => topic.status === "ARCHIVED").map((topic) => ({ topic, meetingId: topic.meetingId })),
      ];
      let movedCount = 0;
      for (const [index, { topic, meetingId }] of order.entries()) {
        const position = index + 1;
        if (topic.position === position && topic.meetingId === meetingId) continue;
        if (topic.status !== "ARCHIVED") movedCount += 1;
        await ctx.tx.topic.update({ where: { id: topic.id }, data: { position, meetingId, updatedById: ctx.teacherId } });
      }
      await this.record(ctx, "topics.reordered", ctx.plan.id, { topicCount: active.length, movedCount }, "CLASS_PLAN");
    });
  }

  /**
   * One plan write: the teacher's plannable class (404 otherwise; archived → 409), its plan
   * (none → 422 SYLLABUS_REQUIRED) and `bumpRevision`, then `apply`, then the updated view.
   */
  private write(
    auth: AuthContext,
    classId: string,
    planRevision: number,
    requestId: string | null,
    apply: (ctx: WriteContext) => Promise<void>,
  ): Promise<ClassPlanView> {
    return this.prisma.runInTransaction(async (tx) => {
      requirePlannable(await this.context.findOwnedOrNotFound(auth.userId, classId, tx), "write");
      const plan = await tx.classPlan.findUnique({ where: { classId } });
      if (!plan) throw syllabusRequired();
      await bumpRevision(tx, plan.id, planRevision);
      await apply({ tx, plan: plan as OpenPlan, actor: { userId: auth.userId, requestId }, classId, teacherId: auth.userId });
      return (await classPlanView(tx, classId))!;
    });
  }

  private record<T extends AuditEventType>(
    ctx: WriteContext,
    type: T,
    targetId: string,
    metadata: AuditMetadata<T>,
    targetType: "TOPIC" | "CLASS_PLAN" = "TOPIC",
  ): Promise<void> {
    return this.audit.record(ctx.tx, {
      type,
      actorType: "USER",
      actorUserId: ctx.actor.userId,
      targetType,
      targetId,
      requestId: ctx.actor.requestId,
      metadata,
    });
  }

  private newTopicData(ctx: WriteContext, fields: TopicFields, meetingId: string | null) {
    return {
      planId: ctx.plan.id,
      meetingId,
      title: fields.title,
      description: fields.description || null,
      origin: "MANUAL" as const,
      createdById: ctx.teacherId,
      updatedById: ctx.teacherId,
      items: { create: fields.itemIds.map((itemId) => ({ itemId })) },
    };
  }

  /** A topic of the plan (archived or not); another plan's or a missing one → 404. */
  private async topicOf(ctx: WriteContext, topicId: string): Promise<Topic> {
    const topic = await ctx.tx.topic.findFirst({ where: { id: topicId, planId: ctx.plan.id } });
    if (!topic) throw notFound();
    return topic;
  }

  /** A non-archived topic of the plan; archived → 409 INVALID_STATE_TRANSITION. */
  private async activeTopic(ctx: WriteContext, topicId: string): Promise<Topic> {
    const topic = await this.topicOf(ctx, topicId);
    if (topic.status === "ARCHIVED") throw invalidStateTransition();
    return topic;
  }

  /** `meetingId` checked against the class (404 otherwise); undefined or null → no meeting. */
  private async meetingOf(ctx: WriteContext, meetingId: string | null | undefined): Promise<string | null> {
    if (!meetingId) return null;
    const meeting = await ctx.tx.classMeeting.findFirst({ where: { id: meetingId, classId: ctx.classId }, select: { id: true } });
    if (!meeting) throw notFound();
    return meeting.id;
  }

  /** Adding `count` non-archived topics must keep the plan within 300 (else 422 TOO_MANY_TOPICS). */
  private async assertRoomFor(ctx: WriteContext, count: number): Promise<void> {
    const active = await ctx.tx.topic.count({ where: { planId: ctx.plan.id, status: { not: "ARCHIVED" } } });
    if (active + count > MAX_TOPICS_PER_PLAN) throw tooManyTopics();
  }

  private async lastPosition(ctx: WriteContext): Promise<number> {
    const last = await ctx.tx.topic.aggregate({ where: { planId: ctx.plan.id }, _max: { position: true } });
    return last._max.position ?? 0;
  }

  /**
   * Items must be the teacher's (else 404, like any id outside their context) and belong to the
   * revision the plan uses (else 422 SYLLABUS_ITEM_NOT_IN_PLAN), unless `kept` already links them.
   */
  private async assertItems(ctx: WriteContext, itemIds: string[], kept: string[]): Promise<void> {
    const wanted = itemIds.filter((id) => !kept.includes(id));
    if (wanted.length === 0) return;
    const items = await ctx.tx.syllabusItem.findMany({
      where: { id: { in: wanted }, revision: { document: { subject: { teacherId: ctx.teacherId } } } },
      select: { revisionId: true },
    });
    if (items.length !== wanted.length) throw notFound();
    if (items.some((item) => item.revisionId !== ctx.plan.syllabusRevisionId)) throw syllabusItemNotInPlan();
  }

  private async itemIdsOf(tx: Tx, topicIds: string[]): Promise<string[]> {
    const links = await tx.topicSyllabusItem.findMany({ where: { topicId: { in: topicIds } }, select: { itemId: true } });
    return [...new Set(links.map((link) => link.itemId))];
  }

  private async replaceItems(tx: Tx, topicId: string, itemIds: string[]): Promise<void> {
    await tx.topicSyllabusItem.deleteMany({ where: { topicId, itemId: { notIn: itemIds } } });
    await tx.topicSyllabusItem.createMany({ data: itemIds.map((itemId) => ({ topicId, itemId })), skipDuplicates: true });
  }
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));
