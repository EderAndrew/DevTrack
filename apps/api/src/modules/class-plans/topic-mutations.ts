import { Injectable } from "@nestjs/common";
import type { Topic } from "../../generated/prisma/client";
import type { Tx } from "../../platform/database/transaction";
import { AuditService } from "../audit/audit.service";
import { TopicStateMachine } from "./topic.state-machine";

/** Who changes the topics, for `updated_by_id` and the audit trail. */
export interface TopicActor {
  userId: string;
  requestId: string | null;
}

export type ArchiveReason = "TEACHER" | "MEETING_REMOVED";

/**
 * Changes to topics made inside a plan write (004 research E14): the calendar's resolutions (US4)
 * and the topic operations of US6 share them. Each runs in the caller's transaction, after
 * `bumpRevision`, and writes its own audit record. Topics are never deleted (FR-038).
 */
@Injectable()
export class TopicMutations {
  constructor(private readonly audit: AuditService) {}

  /** Links the topic to another meeting of the same class (`null`: "Sem data"). */
  async moveToMeeting(tx: Tx, actor: TopicActor, topic: Topic, meetingId: string | null): Promise<void> {
    if (topic.meetingId === meetingId) return;
    await tx.topic.update({ where: { id: topic.id }, data: { meetingId, updatedById: actor.userId } });
    await this.audit.record(tx, {
      type: "topic.updated",
      actorType: "USER",
      actorUserId: actor.userId,
      targetType: "TOPIC",
      targetId: topic.id,
      requestId: actor.requestId,
      metadata: { planId: topic.planId, fields: ["meetingId"] },
    });
  }

  unschedule(tx: Tx, actor: TopicActor, topic: Topic): Promise<void> {
    return this.moveToMeeting(tx, actor, topic, null);
  }

  /**
   * Merges `sources` into `target` (FR-036): each source is archived pointing at it. With
   * `unionItems` (the calendar's MERGE), the target also gains their syllabus items; the "Juntar
   * tópicos" form sends the items the teacher reviewed instead. One `topic.merged` for the target;
   * the merged topics get no `topic.archived` of their own (SC-010).
   */
  async mergeInto(tx: Tx, actor: TopicActor, target: Topic, sources: Topic[], unionItems = true): Promise<void> {
    if (sources.length === 0) return;
    const sourceIds = sources.map((source) => source.id);
    const links = unionItems
      ? await tx.topicSyllabusItem.findMany({ where: { topicId: { in: sourceIds } }, select: { itemId: true } })
      : [];
    const itemIds = [...new Set(links.map((link) => link.itemId))];
    if (itemIds.length > 0) {
      await tx.topicSyllabusItem.createMany({
        data: itemIds.map((itemId) => ({ topicId: target.id, itemId })),
        skipDuplicates: true,
      });
    }
    for (const source of sources) await this.archiveRow(tx, actor, source, { mergedIntoTopicId: target.id });
    await tx.topic.update({ where: { id: target.id }, data: { updatedById: actor.userId } });
    await this.audit.record(tx, {
      type: "topic.merged",
      actorType: "USER",
      actorUserId: actor.userId,
      targetType: "TOPIC",
      targetId: target.id,
      requestId: actor.requestId,
      metadata: { planId: target.planId, mergedTopicIds: sourceIds },
    });
  }

  /** Archives the topic, keeping the status it had for a later restore (FR-038). Already archived → no-op. */
  async archive(tx: Tx, actor: TopicActor, topic: Topic, reason: ArchiveReason): Promise<void> {
    if (!(await this.archiveRow(tx, actor, topic, {}))) return;
    await this.audit.record(tx, {
      type: "topic.archived",
      actorType: "USER",
      actorUserId: actor.userId,
      targetType: "TOPIC",
      targetId: topic.id,
      requestId: actor.requestId,
      metadata: { planId: topic.planId, reason },
    });
  }

  private async archiveRow(tx: Tx, actor: TopicActor, topic: Topic, extra: { mergedIntoTopicId?: string }): Promise<boolean> {
    if (!TopicStateMachine.transition(topic.status, "ARCHIVED")) return false;
    await tx.topic.update({
      where: { id: topic.id },
      data: {
        status: "ARCHIVED",
        statusBeforeArchive: topic.status,
        archivedAt: new Date(),
        updatedById: actor.userId,
        ...extra,
      },
    });
    return true;
  }
}
