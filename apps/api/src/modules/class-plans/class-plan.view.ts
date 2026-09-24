import type { ClassMeetingStatus, ClassMeetingView, ClassPlanView, TopicView } from "@repo/contracts";
import type { PrismaService } from "../../platform/database/prisma.service";
import type { Tx } from "../../platform/database/transaction";
import { isoDate } from "../classes/class.view";

type Db = Tx | PrismaService;

interface MeetingRow {
  id: string;
  date: string;
  number: number;
  status: ClassMeetingStatus;
  topicCount: number;
}

/**
 * The class's meetings by date, numbered with `row_number()` (never stored, research E12), with
 * each meeting's non-archived topics counted.
 */
export function meetingViews(db: Db, classId: string): Promise<ClassMeetingView[]> {
  return db.$queryRaw<MeetingRow[]>`
    SELECT m.id,
           to_char(m.meeting_date, 'YYYY-MM-DD') AS date,
           (row_number() OVER (ORDER BY m.meeting_date))::int AS number,
           m.status::text AS status,
           (SELECT count(*)::int FROM topics t WHERE t.meeting_id = m.id AND t.status <> 'ARCHIVED') AS "topicCount"
    FROM class_meetings m
    WHERE m.class_id = ${classId}::uuid
    ORDER BY m.meeting_date`;
}

/**
 * Topics of a plan with their syllabus items, one query per collection (no N+1). An item outside
 * the revision the plan uses now keeps its link and comes back with `outsideRevision` (E16).
 */
export async function topicViews(
  db: Db,
  plan: { id: string; syllabusRevisionId: string },
  archived: boolean,
): Promise<TopicView[]> {
  const topics = await db.topic.findMany({
    where: { planId: plan.id, status: archived ? "ARCHIVED" : { not: "ARCHIVED" } },
    orderBy: { position: "asc" },
  });
  if (topics.length === 0) return [];
  const links = await db.topicSyllabusItem.findMany({
    where: { topicId: { in: topics.map((topic) => topic.id) } },
    select: {
      topicId: true,
      item: { select: { id: true, text: true, revisionId: true, position: true, group: { select: { position: true } } } },
    },
  });
  // Items in syllabus order: the revision in use first, then group and item position.
  links.sort(
    (a, b) =>
      Number(a.item.revisionId !== plan.syllabusRevisionId) - Number(b.item.revisionId !== plan.syllabusRevisionId) ||
      a.item.revisionId.localeCompare(b.item.revisionId) ||
      a.item.group.position - b.item.group.position ||
      a.item.position - b.item.position,
  );
  const itemsByTopic = new Map<string, TopicView["items"]>();
  for (const { topicId, item } of links) {
    const items = itemsByTopic.get(topicId) ?? [];
    items.push({ id: item.id, text: item.text, outsideRevision: item.revisionId !== plan.syllabusRevisionId });
    itemsByTopic.set(topicId, items);
  }
  return topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    description: topic.description,
    position: topic.position,
    meetingId: topic.meetingId,
    origin: topic.origin,
    status: topic.status,
    items: itemsByTopic.get(topic.id) ?? [],
    mergedIntoTopicId: topic.mergedIntoTopicId,
    splitFromTopicId: topic.splitFromTopicId,
    completedOn: isoDate(topic.completedOn),
    createdAt: topic.createdAt.toISOString(),
    updatedAt: topic.updatedAt.toISOString(),
  }));
}

/** The class's plan as the web shows it (004 contracts/http-api.md `ClassPlanView`); `null` without a plan. */
export async function classPlanView(db: Db, classId: string): Promise<ClassPlanView | null> {
  const plan = await db.classPlan.findUnique({
    where: { classId },
    include: {
      syllabusRevision: { select: { id: true, number: true, document: { select: { id: true, subjectId: true, version: true } } } },
    },
  });
  if (!plan) return null;
  // Sequential: `db` may be an interactive transaction, which runs one query at a time.
  const meetings = await meetingViews(db, classId);
  const topics = await topicViews(db, plan, false);
  const archivedTopicCount = await db.topic.count({ where: { planId: plan.id, status: "ARCHIVED" } });
  const { document } = plan.syllabusRevision;
  return {
    id: plan.id,
    classId: plan.classId,
    status: plan.status,
    revision: plan.revision,
    syllabus: {
      subjectId: document.subjectId,
      documentId: document.id,
      documentVersion: document.version,
      revisionId: plan.syllabusRevision.id,
      revisionNumber: plan.syllabusRevision.number,
    },
    meetings,
    topics,
    archivedTopicCount,
  };
}
