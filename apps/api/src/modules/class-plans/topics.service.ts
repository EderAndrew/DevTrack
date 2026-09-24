import { Injectable } from "@nestjs/common";
import { type ClassPlanView, type CreateTopicRequest, MAX_TOPICS_PER_PLAN } from "@repo/contracts";
import type { ClassPlan, ClassPlanStatus } from "../../generated/prisma/client";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { notFound, syllabusItemNotInPlan, syllabusRequired, tooManyTopics } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { requirePlannable } from "../classes/plannable-class";
import { classPlanView } from "./class-plan.view";
import { bumpRevision } from "./plan-revision.guard";
import { TopicStateMachine } from "./topic.state-machine";

/**
 * Topics of a class plan (004 US5, FR-032 – FR-035). Every topic is created by the teacher
 * (`MANUAL`); `GENERATED` is reserved for AI generation in the next phase.
 */
@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates a topic at the end of the plan: DRAFT while the plan is a draft, ACTIVE once it is
   * READY or ACTIVE (FR-039). No plan → 422 SYLLABUS_REQUIRED (FR-032); a meeting of another
   * class or an item of another teacher → 404; an item outside the revision in use → 422.
   */
  async create(auth: AuthContext, classId: string, input: CreateTopicRequest, requestId: string | null): Promise<ClassPlanView> {
    return this.prisma.runInTransaction(async (tx) => {
      requirePlannable(await this.context.findOwnedOrNotFound(auth.userId, classId, tx), "write");
      const plan = await tx.classPlan.findUnique({ where: { classId } });
      if (!plan) throw syllabusRequired();
      await bumpRevision(tx, plan.id, input.planRevision);
      // bumpRevision refuses an archived plan.
      const planStatus = plan.status as Exclude<ClassPlanStatus, "ARCHIVED">;

      const active = await tx.topic.count({ where: { planId: plan.id, status: { not: "ARCHIVED" } } });
      if (active >= MAX_TOPICS_PER_PLAN) throw tooManyTopics();
      const meetingId = input.meetingId ?? null;
      if (meetingId && !(await tx.classMeeting.findFirst({ where: { id: meetingId, classId }, select: { id: true } }))) {
        throw notFound();
      }
      await this.assertItemsInPlan(tx, auth.userId, plan, input.itemIds);

      const last = await tx.topic.aggregate({ where: { planId: plan.id }, _max: { position: true } });
      const topic = await tx.topic.create({
        data: {
          planId: plan.id,
          meetingId,
          title: input.title,
          description: input.description || null,
          position: (last._max.position ?? 0) + 1,
          origin: "MANUAL",
          status: TopicStateMachine.initialStatus(planStatus),
          createdById: auth.userId,
          updatedById: auth.userId,
          items: { create: input.itemIds.map((itemId) => ({ itemId })) },
        },
      });
      await this.audit.record(tx, {
        type: "topic.created",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "TOPIC",
        targetId: topic.id,
        requestId,
        metadata: { planId: plan.id, itemCount: input.itemIds.length, hasMeeting: meetingId !== null },
      });
      return (await classPlanView(tx, classId))!;
    });
  }

  /**
   * Items must be the teacher's (else 404, like any id outside their context) and belong to the
   * revision the plan uses (else 422 SYLLABUS_ITEM_NOT_IN_PLAN).
   */
  private async assertItemsInPlan(tx: Tx, teacherId: string, plan: ClassPlan, itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return;
    const items = await tx.syllabusItem.findMany({
      where: { id: { in: itemIds }, revision: { document: { subject: { teacherId } } } },
      select: { revisionId: true },
    });
    if (items.length !== itemIds.length) throw notFound();
    if (items.some((item) => item.revisionId !== plan.syllabusRevisionId)) throw syllabusItemNotInPlan();
  }
}
