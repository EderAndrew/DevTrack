import { Injectable } from "@nestjs/common";
import type { ClassPlanEnvelope, ClassPlanView, PlanCoverage, SelectPlanSyllabusRequest } from "@repo/contracts";
import { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { notFound, planRevisionConflict, revisionNotConfirmed } from "../../platform/http/errors";
import type { AuthContext } from "../../platform/http/request-context";
import { AuditService } from "../audit/audit.service";
import { ClassContextPolicy } from "../classes/class-context.policy";
import { requirePlannable } from "../classes/plannable-class";
import { classPlanView } from "./class-plan.view";
import { planCoverage } from "./coverage";
import { lockOwnedClass } from "./owned-class-lock";
import { bumpRevision } from "./plan-revision.guard";

/**
 * The class plan (004 US5, FR-031, FR-042, research E13, E16): created when the class first selects
 * a confirmed syllabus revision of its subject, then read with its meetings and topics.
 */
@Injectable()
export class ClassPlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: ClassContextPolicy,
    private readonly audit: AuditService,
  ) {}

  /** `{plan: null}` while the class has not selected a syllabus. */
  async getEnvelope(teacherId: string, classId: string): Promise<ClassPlanEnvelope> {
    await this.context.findOwnedOrNotFound(teacherId, classId);
    return { plan: await classPlanView(this.prisma, classId) };
  }

  /** The coverage of the revision in use; a class without a plan → 404. */
  async coverage(teacherId: string, classId: string): Promise<PlanCoverage> {
    await this.context.findOwnedOrNotFound(teacherId, classId);
    const plan = await this.prisma.classPlan.findUnique({ where: { classId } });
    if (!plan) throw notFound();
    return planCoverage(this.prisma, plan);
  }

  /**
   * Selects the confirmed revision the plan uses, creating the DRAFT plan the first time
   * (`planRevision: null`). The revision must belong to a document of the class's subject (else
   * 404) and be CONFIRMED (else 422). Switching keeps every topic: links are remapped through the
   * `origin_item_id` chain, and those with no counterpart keep the old item (`outsideRevision`).
   */
  async selectSyllabus(
    auth: AuthContext,
    classId: string,
    input: SelectPlanSyllabusRequest,
    requestId: string | null,
  ): Promise<ClassPlanView> {
    return this.prisma.runInTransaction(async (tx) => {
      const schoolClass = requirePlannable(await lockOwnedClass(tx, this.context, auth.userId, classId), "write");
      const revision = await tx.syllabusRevision.findFirst({
        where: { id: input.revisionId, document: { subjectId: schoolClass.subjectId } },
        select: { id: true, status: true },
      });
      if (!revision) throw notFound();
      if (revision.status !== "CONFIRMED") throw revisionNotConfirmed();

      const current = await tx.classPlan.findUnique({ where: { classId } });
      let planId: string;
      let outsideRevisionLinks = 0;
      if (!current) {
        if (input.planRevision !== null) throw planRevisionConflict();
        planId = (await tx.classPlan.create({ data: { classId, syllabusRevisionId: revision.id } })).id;
      } else {
        if (current.syllabusRevisionId === revision.id && current.revision === input.planRevision) {
          return (await classPlanView(tx, classId))!;
        }
        // null never matches an existing plan's revision.
        await bumpRevision(tx, current.id, input.planRevision ?? 0);
        planId = current.id;
        if (current.syllabusRevisionId !== revision.id) {
          await tx.classPlan.update({ where: { id: planId }, data: { syllabusRevisionId: revision.id } });
          outsideRevisionLinks = await this.remapLinks(tx, planId, revision.id);
        }
      }

      await this.audit.record(tx, {
        type: "class_plan.syllabus_selected",
        actorType: "USER",
        actorUserId: auth.userId,
        targetType: "CLASS_PLAN",
        targetId: planId,
        requestId,
        metadata: {
          classId,
          revisionId: revision.id,
          previousRevisionId: current?.syllabusRevisionId ?? null,
          outsideRevisionLinks,
        },
      });
      return (await classPlanView(tx, classId))!;
    });
  }

  /**
   * Points the plan's topic links at the new revision (E16): an item and its copies share the root
   * of their `origin_item_id` chain, so a linked item is replaced by the new revision's item with
   * the same root. Returns how many links of non-archived topics stay outside the revision.
   */
  private async remapLinks(tx: Tx, planId: string, revisionId: string): Promise<number> {
    const links = await tx.topicSyllabusItem.findMany({
      where: { topic: { planId }, item: { revisionId: { not: revisionId } } },
      select: { topicId: true, itemId: true, topic: { select: { status: true } } },
    });
    if (links.length === 0) return 0;

    const oldIds = [...new Set(links.map((link) => link.itemId))];
    const roots = await tx.$queryRaw<{ itemId: string; rootId: string; revisionId: string; position: number }[]>`
      WITH RECURSIVE chain AS (
        SELECT s.id AS item_id, s.id AS ancestor_id, s.origin_item_id
        FROM syllabus_items s
        WHERE s.id = ANY(${oldIds}::uuid[]) OR s.revision_id = ${revisionId}::uuid
        UNION ALL
        SELECT c.item_id, a.id, a.origin_item_id
        FROM chain c JOIN syllabus_items a ON a.id = c.origin_item_id
      )
      SELECT c.item_id AS "itemId", c.ancestor_id AS "rootId", s.revision_id AS "revisionId",
             (g.position * 10000 + s.position)::int AS position
      FROM chain c
      JOIN syllabus_items s ON s.id = c.item_id
      JOIN syllabus_groups g ON g.id = s.group_id
      WHERE c.origin_item_id IS NULL`;

    // The new revision's item for each root (the first in syllabus order if a root repeats).
    const newByRoot = new Map<string, string>();
    for (const row of roots.filter((r) => r.revisionId === revisionId).sort((a, b) => a.position - b.position)) {
      if (!newByRoot.has(row.rootId)) newByRoot.set(row.rootId, row.itemId);
    }
    const rootOf = new Map(roots.filter((r) => r.revisionId !== revisionId).map((row) => [row.itemId, row.rootId]));

    let outside = 0;
    for (const link of links) {
      const target = newByRoot.get(rootOf.get(link.itemId) ?? "");
      if (!target) {
        if (link.topic.status !== "ARCHIVED") outside += 1;
        continue;
      }
      await tx.topicSyllabusItem.delete({ where: { topicId_itemId: { topicId: link.topicId, itemId: link.itemId } } });
      await tx.topicSyllabusItem.createMany({ data: [{ topicId: link.topicId, itemId: target }], skipDuplicates: true });
    }
    return outside;
  }
}
