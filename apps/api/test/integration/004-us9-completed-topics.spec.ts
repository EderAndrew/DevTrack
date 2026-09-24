import { ClassPlanViewSchema, TopicListSchema, type ClassPlanView } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { planningToday } from "../../src/modules/class-plans/planning-date";
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

/** "YYYY-MM-DD" `days` away from today in the planning time zone. */
const day = (days: number) => {
  const today = new Date(`${planningToday()}T00:00:00.000Z`);
  return new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);
};

describe("004/US9 — aula concluída por tópico (FR-056 – FR-058, E23)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  /** A plan with a past meeting, today's meeting and a future one, and a topic in each plus one without date. */
  async function setup(planStatus: "DRAFT" | "READY" | "ACTIVE" = "ACTIVE") {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id);
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, startsOn: day(-60), endsOn: day(60) });
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
    const confirmed = await createConfirmedRevision(t, document.id, [{ items: ["Classes", "Objetos"] }]);
    const [past, today, future] = await createMeetings(t, schoolClass.id, [day(-7), day(0), day(7)]);
    const plan = await createPlan(t, schoolClass.id, confirmed.revision.id, { status: planStatus });
    const topic = (title: string, meetingId: string | null) => createTopic(t, plan.id, { title, meetingId });
    const taught = await topic("Conceitos de classes", past!.id);
    const neighbour = await topic("Objetos e métodos", past!.id);
    const current = await topic("Construtores", today!.id);
    const upcoming = await topic("Herança", future!.id);
    const unscheduled = await topic("Revisão", null);

    const client = api(t, { cookie: await loginAs(t, teacher) });
    const base = `/api/classes/${schoolClass.id}/plan`;
    let revision = plan.revision;
    const write = async (method: "post" | "patch" | "put", path: string, body: object = {}) => {
      const res = await client[method](`${base}${path}`, { planRevision: revision, ...body });
      if (res.status < 300) revision = (res.body as ClassPlanView).revision;
      return res;
    };
    const view = async () => ClassPlanViewSchema.parse((await client.get(base)).body.plan);
    const topicIn = async (id: string) => (await view()).topics.find((entry) => entry.id === id);
    return {
      schoolClass,
      plan,
      meetings: { past: past!, today: today!, future: future! },
      topics: { taught, neighbour, current, upcoming, unscheduled },
      client,
      write,
      revision: () => revision,
      view,
      topicIn,
    };
  }

  it("004/US9-1 concluir um tópico ativo de aula passada ou de hoje → COMPLETED com a data da aula; auditado sem textos", async () => {
    const { topics, meetings, write, topicIn } = await setup();

    const res = await write("post", `/topics/${topics.taught.id}/complete`);
    expect(res.status).toBe(200);
    expect(await topicIn(topics.taught.id)).toMatchObject({ status: "COMPLETED", completedOn: meetings.past.meetingDate.toISOString().slice(0, 10) });
    expect((await write("post", `/topics/${topics.current.id}/complete`)).status).toBe(200);
    expect((await topicIn(topics.current.id))?.completedOn).toBe(day(0));

    const [completed] = await events("topic.completed");
    expect(completed).toMatchObject({ targetType: "TOPIC", targetId: topics.taught.id });
    expect(Object.keys(completed!.metadata as object)).toEqual(["planId"]);

    // Completing again has no effect and records nothing.
    expect((await write("post", `/topics/${topics.taught.id}/complete`)).status).toBe(200);
    expect(await events("topic.completed")).toHaveLength(2);
  });

  it("004/US9-2 004/FR-057 tópico concluído: editar, dividir, juntar, mudar de aula e trocar de lugar → 409 sem efeito", async () => {
    const { topics, meetings, write, view, revision } = await setup();
    await write("post", `/topics/${topics.taught.id}/complete`);
    const before = await view();
    const itemsOf = (plan: ClassPlanView) => plan.topics.map((topic) => ({ topicId: topic.id, meetingId: topic.meetingId }));

    const refused = [
      await write("patch", `/topics/${topics.taught.id}`, { title: "Outro título" }),
      await write("post", `/topics/${topics.taught.id}/split`, {
        parts: [
          { title: "Parte 1", itemIds: [] },
          { title: "Parte 2", itemIds: [] },
        ],
      }),
      await write("post", "/topics/merge", { topicIds: [topics.taught.id, topics.neighbour.id], title: "Junção", itemIds: [] }),
      await write("post", "/topics/merge", { topicIds: [topics.neighbour.id, topics.taught.id], title: "Junção", itemIds: [] }),
      // Moving it to another meeting or to "Sem data".
      await write("put", "/topic-order", {
        items: itemsOf(before).map((item) => (item.topicId === topics.taught.id ? { ...item, meetingId: meetings.future.id } : item)),
      }),
      await write("put", "/topic-order", {
        items: itemsOf(before).map((item) => (item.topicId === topics.taught.id ? { ...item, meetingId: null } : item)),
      }),
      // "Descer" of the completed topic, or "Subir" of its neighbour: the same swap.
      await write("put", "/topic-order", { items: [itemsOf(before)[1]!, itemsOf(before)[0]!, ...itemsOf(before).slice(2)] }),
    ];
    for (const res of refused) expect(res.body).toMatchObject({ statusCode: 409, code: "INVALID_STATE_TRANSITION" });
    expect(revision()).toBe(before.revision);
    expect(await view()).toEqual(before);
  });

  it("004/FR-057 reordenar os outros tópicos continua permitido; um tópico pode entrar na aula concluída", async () => {
    const { topics, meetings, write, view } = await setup();
    await write("post", `/topics/${topics.taught.id}/complete`);
    const items = (await view()).topics.map((topic) => ({ topicId: topic.id, meetingId: topic.meetingId }));
    // Herança and Revisão swap; Revisão moves into the completed meeting, after the completed topics' neighbours.
    const reordered = items.map((item) =>
      item.topicId === topics.upcoming.id
        ? { topicId: topics.unscheduled.id, meetingId: meetings.past.id }
        : item.topicId === topics.unscheduled.id
          ? { topicId: topics.upcoming.id, meetingId: meetings.future.id }
          : item,
    );
    const res = await write("put", "/topic-order", { items: reordered });
    expect(res.status).toBe(200);
    const plan = await view();
    expect(plan.topics.filter((topic) => topic.meetingId === meetings.past.id).map((topic) => topic.title)).toEqual([
      "Conceitos de classes",
      "Objetos e métodos",
      "Revisão",
    ]);
  });

  it("004/US9-3 aula futura ou sem aula → 422 MEETING_NOT_HELD_YET; planejamento que não está em andamento → 409", async () => {
    const { topics, write, topicIn } = await setup();
    for (const topic of [topics.upcoming, topics.unscheduled]) {
      const res = await write("post", `/topics/${topic.id}/complete`);
      expect(res.body).toMatchObject({ statusCode: 422, code: "MEETING_NOT_HELD_YET" });
      expect((await topicIn(topic.id))?.status).toBe("ACTIVE");
    }

    for (const status of ["DRAFT", "READY"] as const) {
      await resetDb(t.prisma);
      const other = await setup(status);
      const res = await other.write("post", `/topics/${other.topics.taught.id}/complete`);
      expect(res.body).toMatchObject({ statusCode: 409, code: "INVALID_STATE_TRANSITION" });
    }
    expect(await events("topic.completed")).toHaveLength(0);
  });

  it("004/US9-4 reabrir aula → volta a ACTIVE sem data, liberado para editar; auditado", async () => {
    const { topics, write, topicIn } = await setup();
    await write("post", `/topics/${topics.taught.id}/complete`);

    expect((await write("post", `/topics/${topics.taught.id}/reopen`)).status).toBe(200);
    expect(await topicIn(topics.taught.id)).toMatchObject({ status: "ACTIVE", completedOn: null });
    expect((await write("patch", `/topics/${topics.taught.id}`, { title: "Classes e instâncias" })).status).toBe(200);
    const [reopened] = await events("topic.reopened");
    expect(reopened).toMatchObject({ targetId: topics.taught.id });
    expect(Object.keys(reopened!.metadata as object)).toEqual(["planId"]);

    // Reopening an active topic has no effect; an archived one → 409.
    expect((await write("post", `/topics/${topics.taught.id}/reopen`)).status).toBe(200);
    expect(await events("topic.reopened")).toHaveLength(1);
    await write("post", `/topics/${topics.neighbour.id}/archive`);
    expect((await write("post", `/topics/${topics.neighbour.id}/reopen`)).body.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("004/US9-5 arquivar tópico concluído → arquivado com a data da aula; restaurar → 409", async () => {
    const { schoolClass, topics, meetings, client, write } = await setup();
    await write("post", `/topics/${topics.taught.id}/complete`);

    expect((await write("post", `/topics/${topics.taught.id}/archive`)).status).toBe(200);
    const archived = TopicListSchema.parse((await client.get(`/api/classes/${schoolClass.id}/plan/topics?status=ARCHIVED`)).body);
    expect(archived.items).toEqual([
      expect.objectContaining({ id: topics.taught.id, status: "ARCHIVED", completedOn: meetings.past.meetingDate.toISOString().slice(0, 10) }),
    ]);

    const res = await write("post", `/topics/${topics.taught.id}/restore`);
    expect(res.body).toMatchObject({ statusCode: 409, code: "INVALID_STATE_TRANSITION" });
    expect(await events("topic.restored")).toHaveLength(0);
  });

  it("004/US9-6 desmarcar a aula de um tópico concluído: só ARCHIVE é aceito, e o arquivado mantém a data", async () => {
    const { schoolClass, topics, meetings, client, write, revision } = await setup();
    await write("post", `/topics/${topics.taught.id}/complete`);
    const date = meetings.past.meetingDate.toISOString().slice(0, 10);
    const save = (resolutions: object[]) =>
      client.put(`/api/classes/${schoolClass.id}/meetings`, { planRevision: revision(), add: [], remove: [date], resolutions });
    const neighbour = { topicId: topics.neighbour.id, action: "UNSCHEDULE" };

    for (const resolution of [
      { topicId: topics.taught.id, action: "MOVE", meetingDate: day(7) },
      { topicId: topics.taught.id, action: "UNSCHEDULE" },
      { topicId: topics.taught.id, action: "MERGE", intoTopicId: topics.upcoming.id },
    ]) {
      expect((await save([resolution, neighbour])).body).toMatchObject({ statusCode: 409, code: "INVALID_STATE_TRANSITION" });
    }
    // Merging another topic into the completed one is refused too.
    const merged = await save([
      { topicId: topics.taught.id, action: "ARCHIVE" },
      { topicId: topics.neighbour.id, action: "MERGE", intoTopicId: topics.taught.id },
    ]);
    expect(merged.status).toBe(400); // merging into a topic that leaves in the same save
    await write("post", `/topics/${topics.current.id}/complete`);
    const intoCompleted = await client.put(`/api/classes/${schoolClass.id}/meetings`, {
      planRevision: revision(),
      add: [],
      remove: [date],
      resolutions: [
        { topicId: topics.taught.id, action: "ARCHIVE" },
        { topicId: topics.neighbour.id, action: "MERGE", intoTopicId: topics.current.id },
      ],
    });
    expect(intoCompleted.body).toMatchObject({ statusCode: 409, code: "INVALID_STATE_TRANSITION" });

    const ok = await client.put(`/api/classes/${schoolClass.id}/meetings`, {
      planRevision: revision(),
      add: [],
      remove: [date],
      resolutions: [{ topicId: topics.taught.id, action: "ARCHIVE" }, neighbour],
    });
    expect(ok.status).toBe(200);
    const archived = await t.prisma.topic.findUniqueOrThrow({ where: { id: topics.taught.id } });
    expect(archived).toMatchObject({ status: "ARCHIVED", statusBeforeArchive: "COMPLETED", meetingId: null });
    expect(archived.completedOn?.toISOString().slice(0, 10)).toBe(date);
  });

  it("004/FR-058 o banco recusa tópico concluído sem data e data em tópico ativo", async () => {
    const { topics } = await setup();
    await expect(t.prisma.topic.update({ where: { id: topics.taught.id }, data: { status: "COMPLETED" } })).rejects.toThrow();
    await expect(t.prisma.topic.update({ where: { id: topics.taught.id }, data: { completedOn: new Date() } })).rejects.toThrow();
  });
});
