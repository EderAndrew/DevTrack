import {
  createClass,
  createConfirmedRevision,
  createMeetings,
  createPlan,
  createSubject,
  createSyllabusDocument,
  createTopic,
  loginAs,
  syllabusFixture,
  type TestUser,
} from "../helpers/factories";
import { api, type TestApp } from "../helpers/test-app";
import { CURRICULUM, MATRIX, type MatrixEntry, routeKey } from "./authorization-matrix";

/**
 * The 004 matrix (contracts/permissions.md): every row of `MATRIX` guarded by a 004 permission,
 * called against a complete teacher area built here. US6 and US7 add their routes to `MATRIX`
 * and a body to `VALID_BODY`, or the completeness test fails.
 */
export const CURRICULUM_ROUTES = MATRIX.filter((entry) => (CURRICULUM as readonly string[]).includes(entry.access));

/** Everything a teacher owns in 004: a subject with a PNG syllabus (confirmed + draft), a class, meetings, a plan and a topic. */
export interface TeacherArea {
  subjectId: string;
  documentId: string;
  confirmedRevisionId: string;
  draftRevisionId: string;
  itemIds: string[];
  classId: string;
  meetingIds: string[];
  planId: string;
  topicId: string;
  /** A second topic, for merge and reorder. */
  secondTopicId: string;
}

export const PERIOD = { startsOn: "2027-02-01", endsOn: "2027-06-30" };

export async function buildTeacherArea(t: TestApp, teacher: TestUser): Promise<TeacherArea> {
  const subject = await createSubject(t, teacher.id);
  // A PNG, so the inline view of the original (`?view=inline`) is allowed for its owner.
  const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED", fixture: "ementa.png" });
  const confirmed = await createConfirmedRevision(t, document.id, [{ title: "Fundamentos", items: ["Classes", "Objetos"] }]);
  const draft = await t.prisma.syllabusRevision.create({
    data: { documentId: document.id, number: confirmed.revision.number + 1, status: "DRAFT", source: "MANUAL" },
  });
  const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD });
  const meetings = await createMeetings(t, schoolClass.id, ["2027-02-03", "2027-02-10"]);
  const plan = await createPlan(t, schoolClass.id, confirmed.revision.id);
  const topic = await createTopic(t, plan.id, { meetingId: meetings[0]!.id, itemIds: [confirmed.itemIds[0]!] });
  const second = await createTopic(t, plan.id, { itemIds: [confirmed.itemIds[1]!] });
  return {
    subjectId: subject.id,
    documentId: document.id,
    confirmedRevisionId: confirmed.revision.id,
    draftRevisionId: draft.id,
    itemIds: confirmed.itemIds,
    classId: schoolClass.id,
    meetingIds: meetings.map((meeting) => meeting.id),
    planId: plan.id,
    topicId: topic.id,
    secondTopicId: second.id,
  };
}

/**
 * A body that passes validation for each route, so the permission and the context decide. The
 * ids inside a body come from the area of the route (`area`).
 */
export const VALID_BODY: Record<string, (area: TeacherArea) => object> = {
  "GET /subjects": () => ({}),
  "POST /subjects": () => ({ name: `Disciplina ${crypto.randomUUID().slice(0, 8)}` }),
  "GET /subjects/:id": () => ({}),
  "PATCH /subjects/:id": () => ({ description: "Outra descrição" }),
  "POST /subjects/:id/status": () => ({ status: "ACTIVE" }),
  "GET /subjects/:id/syllabus-documents": () => ({}),
  "POST /subjects/:id/syllabus-documents": () => ({}),
  "GET /syllabus-documents/:id": () => ({}),
  "GET /syllabus-documents/:id/file": () => ({}),
  "POST /syllabus-documents/:id/retry": () => ({}),
  "POST /syllabus-documents/:id/revisions": () => ({ source: "MANUAL" }),
  "GET /syllabus-revisions/:id": () => ({}),
  "PUT /syllabus-revisions/:id": () => ({ groups: [{ title: "Grupo", items: [{ text: "Item" }] }] }),
  "POST /syllabus-revisions/:id/confirm": () => ({}),
  "GET /classes/:id/meetings": () => ({}),
  "PUT /classes/:id/meetings": () => ({ planRevision: 1, add: ["2027-03-03"], remove: [], resolutions: [] }),
  "GET /classes/:id/plan": () => ({}),
  "PUT /classes/:id/plan/syllabus": (area) => ({ planRevision: 1, revisionId: area.confirmedRevisionId }),
  "GET /classes/:id/plan/coverage": () => ({}),
  "POST /classes/:id/plan/topics": (area) => ({ planRevision: 1, title: "Tópico", itemIds: [area.itemIds[1]] }),
  "GET /classes/:id/plan/topics": () => ({}),
  "PATCH /classes/:id/plan/topics/:topicId": () => ({ planRevision: 1, title: "Outro título" }),
  "POST /classes/:id/plan/topics/merge": (area) => ({
    planRevision: 1,
    topicIds: [area.topicId, area.secondTopicId],
    title: "Junção",
    itemIds: [],
  }),
  "POST /classes/:id/plan/topics/:topicId/split": () => ({
    planRevision: 1,
    parts: [
      { title: "Parte 1", itemIds: [] },
      { title: "Parte 2", itemIds: [] },
    ],
  }),
  "POST /classes/:id/plan/topics/:topicId/archive": () => ({ planRevision: 1 }),
  "POST /classes/:id/plan/topics/:topicId/restore": () => ({ planRevision: 1 }),
  "PUT /classes/:id/plan/topic-order": (area) => ({
    planRevision: 1,
    items: [
      { topicId: area.secondTopicId, meetingId: null },
      { topicId: area.topicId, meetingId: area.meetingIds[1] },
    ],
  }),
};

/** The id each route's `:id` stands for. */
export function resourceIdFor(entry: MatrixEntry, area: TeacherArea): string {
  if (entry.path.startsWith("/subjects/")) return area.subjectId;
  if (entry.path.startsWith("/syllabus-documents/")) return area.documentId;
  if (entry.path.startsWith("/syllabus-revisions/")) return area.draftRevisionId;
  if (entry.path.startsWith("/classes/")) return area.classId;
  throw new Error(`sem recurso para ${routeKey(entry)}`);
}

export interface CallOptions {
  /** Replaces the route's `:id` (e.g. a missing id). */
  id?: string;
  /** Appended as the query string (`view=inline`). */
  query?: string;
  /** Replaces the route's `:topicId`. */
  topicId?: string;
}

/** Calls `entry` as `user` (anonymous with null) on the resources of `area`. */
export async function callRoute(t: TestApp, entry: MatrixEntry, user: TestUser | null, area: TeacherArea, options: CallOptions = {}) {
  const client = api(t, { cookie: user ? await loginAs(t, user) : undefined });
  const id = options.id ?? (entry.path.includes(":id") ? resourceIdFor(entry, area) : "");
  const topicId = options.topicId ?? area.topicId;
  const url = `/api${entry.path.replace(":id", id).replace(":topicId", topicId)}${options.query ? `?${options.query}` : ""}`;
  if (entry.upload) {
    return client.upload(url, { bytes: syllabusFixture("poo.docx"), filename: "ementa.docx" });
  }
  const body = VALID_BODY[routeKey(entry)]!(area);
  if (entry.method === "GET") return client.get(routeKey(entry) === "GET /classes/:id/plan/topics" ? `${url}?status=ARCHIVED` : url);
  if (entry.method === "PATCH") return client.patch(url, body);
  if (entry.method === "PUT") return client.put(url, body);
  if (entry.method === "DELETE") return client.delete(url);
  return client.post(url, body);
}

/** Row counts and the owner's content, to prove a refused call changed nothing. */
export async function curriculumSnapshot(t: TestApp) {
  return {
    subjects: await t.prisma.subject.findMany({ orderBy: { id: "asc" } }),
    documents: await t.prisma.syllabusDocument.findMany({ orderBy: { id: "asc" }, select: { id: true, processingStatus: true, attempts: true } }),
    revisions: await t.prisma.syllabusRevision.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, updatedAt: true } }),
    items: await t.prisma.syllabusItem.count(),
    meetings: await t.prisma.classMeeting.count(),
    plans: await t.prisma.classPlan.findMany({ orderBy: { id: "asc" }, select: { id: true, revision: true, syllabusRevisionId: true } }),
    topics: await t.prisma.topic.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, meetingId: true, title: true } }),
    links: await t.prisma.topicSyllabusItem.count(),
  };
}
