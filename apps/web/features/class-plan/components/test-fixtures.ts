import type { ClassMeetingView, ClassPlanEnvelope, ClassPlanView, PlanCoverage, TopicView } from "@repo/contracts";

export const CLASS_ID = "00000000-0000-4000-9000-000000000555";

let sequence = 0;
export const uuid = () => `00000000-0000-4000-8000-${String((sequence += 1)).padStart(12, "0")}`;

export const meetingView = (date: string, number: number, topicCount = 0): ClassMeetingView => ({
  id: uuid(),
  date,
  number,
  status: "PLANNED",
  topicCount,
});

export const topicView = (title: string, overrides: Partial<TopicView> = {}): TopicView => ({
  id: uuid(),
  title,
  description: null,
  position: 1,
  meetingId: null,
  origin: "MANUAL",
  status: "DRAFT",
  items: [],
  mergedIntoTopicId: null,
  splitFromTopicId: null,
  createdAt: "2027-01-10T12:00:00.000Z",
  updatedAt: "2027-01-10T12:00:00.000Z",
  ...overrides,
});

export const planView = (overrides: Partial<ClassPlanView> = {}): ClassPlanView => ({
  id: uuid(),
  classId: CLASS_ID,
  status: "DRAFT",
  revision: 3,
  syllabus: { subjectId: uuid(), documentId: uuid(), documentVersion: 2, revisionId: uuid(), revisionNumber: 1 },
  meetings: [],
  topics: [],
  archivedTopicCount: 0,
  ...overrides,
});

export const envelope = (plan: ClassPlanView | null): ClassPlanEnvelope => ({ plan });

/** Coverage of `groups` (title → item texts); `covered` maps an item text to the topics that cover it. */
export function coverageView(
  groups: { title: string | null; items: string[] }[],
  covered: Record<string, string[]> = {},
): PlanCoverage & { itemId: (text: string) => string } {
  const ids = new Map<string, string>();
  const view = groups.map((group) => ({
    id: uuid(),
    title: group.title,
    items: group.items.map((text) => {
      const id = uuid();
      ids.set(text, id);
      return { id, text, topicIds: covered[text] ?? [] };
    }),
  }));
  const items = view.flatMap((group) => group.items);
  return {
    groups: view,
    coveredCount: items.filter((item) => item.topicIds.length > 0).length,
    totalCount: items.length,
    itemId: (text) => ids.get(text)!,
  };
}
