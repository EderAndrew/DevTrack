import type { PlanCoverage } from "@repo/contracts";
import type { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";

/**
 * Coverage of the syllabus revision a plan uses (004 research E15, FR-040): each item with the
 * non-archived topics of the plan linked to it, in topic order. Computed on read; an item in
 * several topics counts once.
 */
export async function planCoverage(
  db: Tx | PrismaService,
  plan: { id: string; syllabusRevisionId: string },
): Promise<PlanCoverage> {
  const groups = await db.syllabusGroup.findMany({
    where: { revisionId: plan.syllabusRevisionId },
    orderBy: { position: "asc" },
    select: { id: true, title: true, items: { orderBy: { position: "asc" }, select: { id: true, text: true } } },
  });
  const links = await db.topicSyllabusItem.findMany({
    where: {
      item: { revisionId: plan.syllabusRevisionId },
      topic: { planId: plan.id, status: { not: "ARCHIVED" } },
    },
    select: { itemId: true, topic: { select: { id: true, position: true } } },
  });
  links.sort((a, b) => a.topic.position - b.topic.position);
  const topicsByItem = new Map<string, string[]>();
  for (const link of links) topicsByItem.set(link.itemId, [...(topicsByItem.get(link.itemId) ?? []), link.topic.id]);

  let coveredCount = 0;
  let totalCount = 0;
  const view = groups.map((group) => ({
    id: group.id,
    title: group.title,
    items: group.items.map((item) => {
      const topicIds = topicsByItem.get(item.id) ?? [];
      totalCount += 1;
      if (topicIds.length > 0) coveredCount += 1;
      return { id: item.id, text: item.text, topicIds };
    }),
  }));
  return { groups: view, coveredCount, totalCount };
}
