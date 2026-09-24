import {
  ClassPlanViewSchema,
  endpoints,
  MAX_TOPICS_PER_PLAN,
  PlanCoverageSchema,
  TopicListSchema,
  type ClassPlanView,
} from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createConfirmedRevision,
  createMeetings,
  createPlan,
  createSubject,
  createSyllabusDocument,
  createTopic,
  createUser,
  loginAs,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { registeredRoutes } from "../helpers/routes";

const PERIOD = { startsOn: "2027-02-01", endsOn: "2027-06-30" };
const DATES = ["2027-03-04", "2027-03-11", "2027-03-18", "2027-03-25", "2027-04-01", "2027-04-08"];
const ITEMS = [
  "Herança",
  "Modificadores de acesso",
  "Princípio de substituição de Liskov",
  "Segregação de interfaces",
  "Inversão de dependência",
  "Introdução a bibliotecas para POO",
];

describe("004/US6 — editar e reorganizar os tópicos (FR-035 – FR-038, E14)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  /** A plan with six meetings, six syllabus items and the topics of the independent test. */
  async function setup(planStatus: "DRAFT" | "READY" = "DRAFT") {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id);
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD });
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
    const confirmed = await createConfirmedRevision(t, document.id, [{ title: "POO", items: ITEMS }]);
    const meetings = await createMeetings(t, schoolClass.id, DATES);
    const plan = await createPlan(t, schoolClass.id, confirmed.revision.id, { status: planStatus });
    const item = (text: string) => confirmed.itemIds[ITEMS.indexOf(text)]!;
    const topic = (title: string, meeting: number | null, items: string[]) =>
      createTopic(t, plan.id, {
        title,
        meetingId: meeting === null ? null : meetings[meeting - 1]!.id,
        itemIds: items.map(item),
      });
    const heranca = await topic("Herança", 5, ["Herança"]);
    const modificadores = await topic("Modificadores de acesso", 6, ["Modificadores de acesso"]);
    const solid = await topic("SOLID: LSP, ISP e DIP", 3, [
      "Princípio de substituição de Liskov",
      "Segregação de interfaces",
      "Inversão de dependência",
    ]);
    const bibliotecas = await topic("Introdução a bibliotecas para POO", 4, ["Introdução a bibliotecas para POO"]);

    const client = api(t, { cookie: await loginAs(t, teacher) });
    const base = `/api/classes/${schoolClass.id}/plan`;
    let revision = plan.revision;
    /** Sends a plan write with the current revision and keeps the new one. */
    const write = async (method: "post" | "patch" | "put", path: string, body: object = {}) => {
      const res = await client[method](`${base}${path}`, { planRevision: revision, ...body });
      if (res.status < 300) revision = (res.body as ClassPlanView).revision;
      return res;
    };
    return {
      teacher,
      subject,
      schoolClass,
      document,
      confirmed,
      meetings,
      plan,
      item,
      topics: { heranca, modificadores, solid, bibliotecas },
      client,
      base,
      write,
      revision: () => revision,
      view: async () => ClassPlanViewSchema.parse((await client.get(base)).body.plan),
      coverage: async () => PlanCoverageSchema.parse((await client.get(`${base}/coverage`)).body),
    };
  }

  /** The syllabus the plans use and the original file: no topic operation changes them (FR-040). */
  const syllabusSnapshot = async (documentId: string, revisionId: string) => ({
    document: await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: documentId }, include: { file: { select: { id: true, sha256: true, sizeBytes: true } } } }),
    revision: await t.prisma.syllabusRevision.findUniqueOrThrow({
      where: { id: revisionId },
      include: { groups: { include: { items: true } } },
    }),
  });

  it("004/US6-1 editar título e descrição → topic.updated com fields, sem textos; ementa e SHA-256 iguais", async () => {
    const { teacher, document, confirmed, topics, write } = await setup();
    const before = await syllabusSnapshot(document.id, confirmed.revision.id);

    const res = await write("patch", `/topics/${topics.heranca.id}`, {
      title: "Herança e composição",
      description: "Quando herdar e quando compor.",
    });

    expect(res.status).toBe(200);
    const updated = ClassPlanViewSchema.parse(res.body).topics.find((topic) => topic.id === topics.heranca.id)!;
    expect(updated).toMatchObject({ title: "Herança e composição", description: "Quando herdar e quando compor." });
    const [event] = await events("topic.updated");
    expect(event).toMatchObject({ actorUserId: teacher.id, targetType: "TOPIC", targetId: topics.heranca.id });
    expect(event!.metadata).toEqual({ planId: topics.heranca.planId, fields: ["title", "description"] });
    expect(JSON.stringify(event!.metadata)).not.toContain("Herança");
    expect(await syllabusSnapshot(document.id, confirmed.revision.id)).toEqual(before);
  });

  it("004/US6-1 editar itens e aula; tópico arquivado → 409 INVALID_STATE_TRANSITION; item fora da revisão → 422", async () => {
    const { topics, meetings, item, write, plan, subject } = await setup();
    const res = await write("patch", `/topics/${topics.heranca.id}`, {
      meetingId: meetings[0]!.id,
      itemIds: [item("Herança"), item("Modificadores de acesso")],
    });
    expect(res.status).toBe(200);
    const updated = (res.body as ClassPlanView).topics.find((topic) => topic.id === topics.heranca.id)!;
    expect(updated.meetingId).toBe(meetings[0]!.id);
    expect(updated.items.map((entry) => entry.text)).toEqual(["Herança", "Modificadores de acesso"]);
    const [event] = await events("topic.updated");
    expect(event!.metadata).toEqual({ planId: plan.id, fields: ["meetingId", "itemIds"] });

    await t.prisma.topic.update({
      where: { id: topics.bibliotecas.id },
      data: { status: "ARCHIVED", statusBeforeArchive: "DRAFT", archivedAt: new Date() },
    });
    const archived = await write("patch", `/topics/${topics.bibliotecas.id}`, { title: "Outro" });
    expect({ status: archived.status, code: archived.body.code }).toEqual({ status: 409, code: "INVALID_STATE_TRANSITION" });

    const other = await createSyllabusDocument(t, subject.id, { status: "PROCESSED", fixture: "poo.docx" });
    const otherRevision = await createConfirmedRevision(t, other.id, [{ items: ["Outro item"] }]);
    const outside = await write("patch", `/topics/${topics.heranca.id}`, { itemIds: [otherRevision.itemIds[0]] });
    expect({ status: outside.status, code: outside.body.code }).toEqual({ status: 422, code: "SYLLABUS_ITEM_NOT_IN_PLAN" });
  });

  describe("004/US6-2 juntar tópicos", () => {
    it("fica um tópico com os dados revisados e a união dos itens; o outro ARCHIVED com mergedIntoTopicId; um topic.merged", async () => {
      const { topics, meetings, item, write, plan } = await setup();

      const res = await write("post", "/topics/merge", {
        topicIds: [topics.heranca.id, topics.modificadores.id],
        title: "Herança + Modificadores de Acesso",
        description: "Os dois juntos.",
        meetingId: meetings[4]!.id,
        itemIds: [item("Herança"), item("Modificadores de acesso")],
      });

      expect(res.status).toBe(200);
      const view = ClassPlanViewSchema.parse(res.body);
      const merged = view.topics.find((topic) => topic.id === topics.heranca.id)!;
      expect(merged).toMatchObject({
        title: "Herança + Modificadores de Acesso",
        description: "Os dois juntos.",
        meetingId: meetings[4]!.id,
      });
      expect(merged.items.map((entry) => entry.text)).toEqual(["Herança", "Modificadores de acesso"]);
      expect(view.topics.some((topic) => topic.id === topics.modificadores.id)).toBe(false);
      expect(view.archivedTopicCount).toBe(1);
      const source = await t.prisma.topic.findUniqueOrThrow({ where: { id: topics.modificadores.id } });
      expect(source).toMatchObject({ status: "ARCHIVED", mergedIntoTopicId: topics.heranca.id });

      const merges = await events("topic.merged");
      expect(merges).toHaveLength(1);
      expect(merges[0]!.metadata).toEqual({ planId: plan.id, mergedTopicIds: [topics.modificadores.id] });
      expect(await events("topic.archived")).toHaveLength(0);
    });

    it("tópico arquivado → 409; de outro planejamento → 404; ids repetidos → 400", async () => {
      const { topics, write, teacher } = await setup();
      await t.prisma.topic.update({
        where: { id: topics.bibliotecas.id },
        data: { status: "ARCHIVED", statusBeforeArchive: "DRAFT", archivedAt: new Date() },
      });
      const body = (topicIds: string[]) => ({ topicIds, title: "Junção", itemIds: [] });

      const archived = await write("post", "/topics/merge", body([topics.heranca.id, topics.bibliotecas.id]));
      expect({ status: archived.status, code: archived.body.code }).toEqual({ status: 409, code: "INVALID_STATE_TRANSITION" });

      const otherSubject = await createSubject(t, teacher.id);
      const otherClass = await createClass(t, teacher.id, { subjectId: otherSubject.id, ...PERIOD });
      const otherDocument = await createSyllabusDocument(t, otherSubject.id, { status: "PROCESSED" });
      const otherRevision = await createConfirmedRevision(t, otherDocument.id, [{ items: ["X"] }]);
      const otherPlan = await createPlan(t, otherClass.id, otherRevision.revision.id);
      const foreign = await createTopic(t, otherPlan.id);
      const cross = await write("post", "/topics/merge", body([topics.heranca.id, foreign.id]));
      expect({ status: cross.status, code: cross.body.code }).toEqual({ status: 404, code: "NOT_FOUND" });

      const repeated = await write("post", "/topics/merge", body([topics.heranca.id, topics.heranca.id]));
      expect(repeated.status).toBe(400);
      expect(await t.prisma.topic.count({ where: { status: "ARCHIVED" } })).toBe(1);
    });
  });

  describe("004/US6-3 dividir tópico", () => {
    it("partes com itens distribuídos (um item em duas), original como primeira parte, demais com splitFromTopicId", async () => {
      const { topics, meetings, item, write, plan } = await setup();

      const res = await write("post", `/topics/${topics.solid.id}/split`, {
        parts: [
          { title: "SOLID — LSP", meetingId: meetings[2]!.id, itemIds: [item("Princípio de substituição de Liskov")] },
          {
            title: "SOLID — ISP + DIP",
            meetingId: meetings[3]!.id,
            itemIds: [item("Segregação de interfaces"), item("Inversão de dependência"), item("Princípio de substituição de Liskov")],
          },
          { title: "SOLID — exercícios", itemIds: [] },
        ],
      });

      expect(res.status).toBe(200);
      const view = ClassPlanViewSchema.parse(res.body);
      expect(view.topics.map((topic) => topic.title)).toEqual([
        "Herança",
        "Modificadores de acesso",
        "SOLID — LSP",
        "SOLID — ISP + DIP",
        "SOLID — exercícios",
        "Introdução a bibliotecas para POO",
      ]);
      expect(view.topics.map((topic) => topic.position)).toEqual([1, 2, 3, 4, 5, 6]);
      const [original, second, third] = view.topics.slice(2);
      expect(original).toMatchObject({ id: topics.solid.id, splitFromTopicId: null, status: "DRAFT" });
      expect(original!.items.map((entry) => entry.text)).toEqual(["Princípio de substituição de Liskov"]);
      expect(second).toMatchObject({ splitFromTopicId: topics.solid.id, status: "DRAFT", meetingId: meetings[3]!.id, origin: "MANUAL" });
      expect(second!.items).toHaveLength(3);
      expect(third).toMatchObject({ splitFromTopicId: topics.solid.id, meetingId: null, items: [] });

      const [event] = await events("topic.split");
      expect(event).toMatchObject({ targetType: "TOPIC", targetId: topics.solid.id });
      expect(event!.metadata).toEqual({ planId: plan.id, newTopicIds: [second!.id, third!.id] });
    });

    it("tópico sem itens também divide; planejamento pronto → partes ACTIVE", async () => {
      const { plan, write } = await setup("READY");
      const empty = await createTopic(t, plan.id, { title: "Apresentação" });
      const res = await write("post", `/topics/${empty.id}/split`, {
        parts: [{ title: "Apresentação", itemIds: [] }, { title: "Combinados", itemIds: [] }],
      });
      expect(res.status).toBe(200);
      expect((res.body as ClassPlanView).topics.filter((topic) => topic.title === "Combinados")[0]!.status).toBe("ACTIVE");
    });
  });

  it("004/US6-4 tópico manual sem itens, com ou sem aula", async () => {
    const { meetings, write } = await setup();
    const withMeeting = await write("post", "/topics", { title: "Apresentação da disciplina", meetingId: meetings[0]!.id, itemIds: [] });
    expect(withMeeting.status).toBe(201);
    const without = await write("post", "/topics", { title: "Revisão para a prova", itemIds: [] });
    expect(without.status).toBe(201);
    const created = (without.body as ClassPlanView).topics.filter((topic) => topic.items.length === 0 && topic.origin === "MANUAL");
    expect(created.map((topic) => [topic.title, topic.meetingId])).toEqual([
      ["Apresentação da disciplina", meetings[0]!.id],
      ["Revisão para a prova", null],
    ]);
  });

  describe("004/US6-5 arquivar e restaurar", () => {
    it("arquivar tira do planejamento e o item fica não coberto; restaurar devolve a statusBeforeArchive", async () => {
      const { topics, item, write, client, base, coverage, plan } = await setup();

      const archived = await write("post", `/topics/${topics.bibliotecas.id}/archive`);
      expect(archived.status).toBe(200);
      expect((archived.body as ClassPlanView).topics.some((topic) => topic.id === topics.bibliotecas.id)).toBe(false);
      expect((archived.body as ClassPlanView).archivedTopicCount).toBe(1);
      const uncovered = (await coverage()).groups[0]!.items.find((entry) => entry.id === item("Introdução a bibliotecas para POO"))!;
      expect(uncovered.topicIds).toEqual([]);
      const [archivedEvent] = await events("topic.archived");
      expect(archivedEvent!.metadata).toEqual({ planId: plan.id, reason: "TEACHER" });

      const list = await client.get(`${base}/topics?status=ARCHIVED`);
      expect(list.status).toBe(200);
      expect(TopicListSchema.parse(list.body).items.map((topic) => topic.id)).toEqual([topics.bibliotecas.id]);

      const restored = await write("post", `/topics/${topics.bibliotecas.id}/restore`);
      expect(restored.status).toBe(200);
      const back = (restored.body as ClassPlanView).topics.find((topic) => topic.id === topics.bibliotecas.id)!;
      expect(back.status).toBe("DRAFT");
      expect((await coverage()).coveredCount).toBe(ITEMS.length);
      const [restoredEvent] = await events("topic.restored");
      expect(restoredEvent!.metadata).toEqual({ planId: plan.id, status: "DRAFT" });
    });

    it("com o planejamento confirmado, restaurar devolve ACTIVE", async () => {
      const { topics, write } = await setup("READY");
      await write("post", `/topics/${topics.heranca.id}/archive`);
      const res = await write("post", `/topics/${topics.heranca.id}/restore`);
      expect((res.body as ClassPlanView).topics.find((topic) => topic.id === topics.heranca.id)!.status).toBe("ACTIVE");
    });

    it("restaurar tópico não arquivado → 409; restaurar acima de 300 → 422 TOO_MANY_TOPICS", async () => {
      const { topics, write, plan, teacher } = await setup();
      const notArchived = await write("post", `/topics/${topics.heranca.id}/restore`);
      expect({ status: notArchived.status, code: notArchived.body.code }).toEqual({ status: 409, code: "INVALID_STATE_TRANSITION" });

      await write("post", `/topics/${topics.bibliotecas.id}/archive`);
      await t.prisma.topic.createMany({
        data: Array.from({ length: MAX_TOPICS_PER_PLAN - 3 }, (_, index) => ({
          planId: plan.id,
          title: `Extra ${index}`,
          position: 100 + index,
          origin: "MANUAL" as const,
          status: "DRAFT" as const,
          createdById: teacher.id,
          updatedById: teacher.id,
        })),
      });
      const full = await write("post", `/topics/${topics.bibliotecas.id}/restore`);
      expect({ status: full.status, code: full.body.code }).toEqual({ status: 422, code: "TOO_MANY_TOPICS" });
    });
  });

  describe("004/US6-6 reordenar e mover numa operação", () => {
    it("regrava posições 1..N e aulas; encontro sem tópico e tópico sem aula; arquivados depois; topics.reordered", async () => {
      const { topics, meetings, write, plan } = await setup();
      await write("post", `/topics/${topics.bibliotecas.id}/archive`);

      const res = await write("put", "/topic-order", {
        items: [
          { topicId: topics.solid.id, meetingId: meetings[0]!.id },
          { topicId: topics.heranca.id, meetingId: null },
          { topicId: topics.modificadores.id, meetingId: meetings[5]!.id },
        ],
      });

      expect(res.status).toBe(200);
      const view = ClassPlanViewSchema.parse(res.body);
      expect(view.topics.map((topic) => [topic.id, topic.position, topic.meetingId])).toEqual([
        [topics.solid.id, 1, meetings[0]!.id],
        [topics.heranca.id, 2, null],
        [topics.modificadores.id, 3, meetings[5]!.id],
      ]);
      // Meetings 02–05 are left without a topic.
      expect(view.meetings.filter((meeting) => meeting.topicCount === 0).map((meeting) => meeting.number)).toEqual([2, 3, 4, 5]);
      expect((await t.prisma.topic.findUniqueOrThrow({ where: { id: topics.bibliotecas.id } })).position).toBe(4);
      const [event] = await events("topics.reordered");
      expect(event).toMatchObject({ targetType: "CLASS_PLAN", targetId: plan.id });
      expect(event!.metadata).toEqual({ topicCount: 3, movedCount: 3 });
    });

    it("lista incompleta, com tópico arquivado ou com encontro de outra turma → recusada sem efeito", async () => {
      const { topics, write, teacher, subject } = await setup();
      await write("post", `/topics/${topics.bibliotecas.id}/archive`);
      const active = [topics.heranca, topics.modificadores, topics.solid].map((topic) => ({ topicId: topic.id, meetingId: null }));
      const positions = async () => (await t.prisma.topic.findMany({ orderBy: { id: "asc" } })).map((topic) => topic.position);
      const before = await positions();

      const incomplete = await write("put", "/topic-order", { items: active.slice(1) });
      expect(incomplete.status).toBe(400);
      const withArchived = await write("put", "/topic-order", { items: [...active, { topicId: topics.bibliotecas.id, meetingId: null }] });
      expect(withArchived.status).toBe(400);
      const otherClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD });
      const [foreignMeeting] = await createMeetings(t, otherClass.id, ["2027-03-04"]);
      const foreign = await write("put", "/topic-order", {
        items: active.map((entry, index) => (index === 0 ? { ...entry, meetingId: foreignMeeting!.id } : entry)),
      });
      expect(foreign.status).toBe(404);
      expect(await positions()).toEqual(before);
    });
  });

  it("004/US6-7 004/FR-041 duas gravações com o mesmo planRevision: a segunda 409, a primeira preservada", async () => {
    const { topics, client, base, plan } = await setup();

    const first = await client.patch(`${base}/topics/${topics.heranca.id}`, { planRevision: plan.revision, title: "Primeira aba" });
    const second = await client.patch(`${base}/topics/${topics.heranca.id}`, { planRevision: plan.revision, title: "Segunda aba" });

    expect(first.status).toBe(200);
    expect({ status: second.status, code: second.body.code }).toEqual({ status: 409, code: "PLAN_REVISION_CONFLICT" });
    expect((await t.prisma.topic.findUniqueOrThrow({ where: { id: topics.heranca.id } })).title).toBe("Primeira aba");
    expect((await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision).toBe(plan.revision + 1);
  });

  it("004/US6-8 não existe exclusão de tópico: nem no catálogo nem na aplicação", async () => {
    const { topics, client, base } = await setup();
    const deletes = Object.values(endpoints).filter((entry) => entry.method === "DELETE" && entry.path.includes("topic"));
    expect(deletes).toEqual([]);
    expect((await registeredRoutes()).filter(({ route }) => route.startsWith("DELETE") && route.includes("topic"))).toEqual([]);
    const res = await client.delete(`${base}/topics/${topics.heranca.id}`);
    expect(res.status).toBe(404);
    expect(await t.prisma.topic.count({ where: { id: topics.heranca.id } })).toBe(1);
  });

  it("004/SC-007 depois de junções e divisões, todos os itens de origem continuam ligados e a cobertura bate", async () => {
    const { topics, item, write, coverage, document, confirmed, view } = await setup();
    const before = await syllabusSnapshot(document.id, confirmed.revision.id);

    await write("post", "/topics/merge", {
      topicIds: [topics.heranca.id, topics.modificadores.id],
      title: "Herança + Modificadores de Acesso",
      itemIds: [item("Herança"), item("Modificadores de acesso")],
    });
    await write("post", `/topics/${topics.solid.id}/split`, {
      parts: [
        { title: "SOLID — LSP", itemIds: [item("Princípio de substituição de Liskov")] },
        { title: "SOLID — ISP + DIP", itemIds: [item("Segregação de interfaces"), item("Inversão de dependência")] },
      ],
    });
    await write("post", `/topics/${topics.bibliotecas.id}/archive`);

    const linked = new Set((await view()).topics.flatMap((topic) => topic.items.map((entry) => entry.id)));
    expect(linked).toEqual(new Set(ITEMS.filter((text) => text !== "Introdução a bibliotecas para POO").map(item)));
    const result = await coverage();
    expect(result).toMatchObject({ coveredCount: ITEMS.length - 1, totalCount: ITEMS.length });
    // Archived topics keep their links: nothing is lost (FR-038).
    expect(await t.prisma.topicSyllabusItem.count({ where: { topicId: topics.bibliotecas.id } })).toBe(1);
    expect(await syllabusSnapshot(document.id, confirmed.revision.id)).toEqual(before);
  });
});
