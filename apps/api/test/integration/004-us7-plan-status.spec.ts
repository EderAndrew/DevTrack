import { ClassPlanViewSchema, PlanCoverageSchema, TopicListSchema, type ClassPlanView } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ClassPlanStatus } from "../../src/generated/prisma/client";
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

const PERIOD = { startsOn: "2027-02-01", endsOn: "2027-06-30" };

describe("004/US7 — situação do planejamento (FR-031, FR-039, FR-043)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  /** A plan in `status` with two DRAFT topics (one per item) and two meetings. */
  async function setup(status: ClassPlanStatus = "DRAFT", options: { topics?: boolean } = {}) {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id);
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD });
    const document = await createSyllabusDocument(t, subject.id, { status: "PROCESSED" });
    const confirmed = await createConfirmedRevision(t, document.id, [{ title: "POO", items: ["Classes", "Herança", "Interfaces"] }]);
    const meetings = await createMeetings(t, schoolClass.id, ["2027-03-04", "2027-03-11"]);
    const plan = await createPlan(t, schoolClass.id, confirmed.revision.id, { status });
    const topics =
      options.topics === false
        ? []
        : [
            await createTopic(t, plan.id, { title: "Classes", status: "DRAFT", meetingId: meetings[0]!.id, itemIds: [confirmed.itemIds[0]!] }),
            await createTopic(t, plan.id, { title: "Herança", status: "DRAFT", itemIds: [confirmed.itemIds[1]!] }),
          ];
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const base = `/api/classes/${schoolClass.id}/plan`;
    let revision = plan.revision;
    const write = async (method: "post" | "patch" | "put", path: string, body: object = {}) => {
      const res = await client[method](`${base}${path}`, { planRevision: revision, ...body });
      if (res.status < 300) revision = (res.body as ClassPlanView).revision;
      return res;
    };
    return {
      teacher,
      subject,
      schoolClass,
      confirmed,
      meetings,
      plan,
      topics,
      client,
      base,
      write,
      revision: () => revision,
      status: (action: string) => write("post", "/status", { action }),
    };
  }

  const statuses = async (planId: string) =>
    (await t.prisma.topic.findMany({ where: { planId }, orderBy: { position: "asc" } })).map((topic) => topic.status);

  it("004/US7-1 CONFIRM → READY, tópicos DRAFT viram ACTIVE, class_plan.status_changed com activatedTopics", async () => {
    const { teacher, schoolClass, plan, status } = await setup();

    const res = await status("CONFIRM");

    expect(res.status).toBe(200);
    const view = ClassPlanViewSchema.parse(res.body);
    expect(view).toMatchObject({ status: "READY", revision: plan.revision + 1 });
    expect(view.topics.map((topic) => topic.status)).toEqual(["ACTIVE", "ACTIVE"]);
    const [event] = await events("class_plan.status_changed");
    expect(event).toMatchObject({ actorUserId: teacher.id, targetType: "CLASS_PLAN", targetId: plan.id });
    expect(event!.metadata).toEqual({ classId: schoolClass.id, from: "DRAFT", to: "READY", activatedTopics: 2 });
    expect((await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })).statusChangedAt).not.toBeNull();
  });

  it("004/US7-2 sem tópico não arquivado → 422 PLAN_HAS_NO_TOPICS, nada muda", async () => {
    const { plan, status } = await setup("DRAFT", { topics: false });
    await createTopic(t, plan.id, { status: "ARCHIVED" });

    const res = await status("CONFIRM");

    expect({ status: res.status, code: res.body.code }).toEqual({ status: 422, code: "PLAN_HAS_NO_TOPICS" });
    expect(await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })).toMatchObject({
      status: "DRAFT",
      revision: plan.revision,
    });
  });

  it("004/US7-3 REOPEN → DRAFT, os tópicos continuam ACTIVE", async () => {
    const { plan, status } = await setup();
    await status("CONFIRM");

    const res = await status("REOPEN");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DRAFT");
    expect(await statuses(plan.id)).toEqual(["ACTIVE", "ACTIVE"]);
  });

  it("004/US7-4 004/FR-039 START → ACTIVE; tópico criado, dividido ou restaurado depois nasce ACTIVE", async () => {
    const { topics, status, write } = await setup();
    await status("CONFIRM");
    await write("post", `/topics/${topics[1]!.id}/archive`);
    const started = await status("START");
    expect(started.body.status).toBe("ACTIVE");

    const created = await write("post", "/topics", { title: "Novo", itemIds: [] });
    expect((created.body as ClassPlanView).topics.find((topic) => topic.title === "Novo")!.status).toBe("ACTIVE");

    const split = await write("post", `/topics/${topics[0]!.id}/split`, {
      parts: [
        { title: "Classes", itemIds: [] },
        { title: "Objetos", itemIds: [] },
      ],
    });
    expect((split.body as ClassPlanView).topics.find((topic) => topic.title === "Objetos")!.status).toBe("ACTIVE");

    const restored = await write("post", `/topics/${topics[1]!.id}/restore`);
    expect((restored.body as ClassPlanView).topics.find((topic) => topic.id === topics[1]!.id)!.status).toBe("ACTIVE");
  });

  it("004/US7-5 em ACTIVE, editar, juntar e mover são aceitos e auditados", async () => {
    const { topics, meetings, status, write } = await setup("READY");
    await status("START");

    expect((await write("patch", `/topics/${topics[0]!.id}`, { title: "Classes e objetos" })).status).toBe(200);
    expect(
      (
        await write("put", "/topic-order", {
          items: [
            { topicId: topics[1]!.id, meetingId: meetings[1]!.id },
            { topicId: topics[0]!.id, meetingId: null },
          ],
        })
      ).status,
    ).toBe(200);
    expect(
      (await write("post", "/topics/merge", { topicIds: [topics[0]!.id, topics[1]!.id], title: "Tudo", itemIds: [] })).status,
    ).toBe(200);
    for (const type of ["topic.updated", "topics.reordered", "topic.merged"]) expect(await events(type), type).toHaveLength(1);
  });

  describe("004/US7-6 arquivar deixa o planejamento somente leitura", () => {
    it.each(["DRAFT", "READY", "ACTIVE"] as const)("ARCHIVE a partir de %s → ARCHIVED", async (from) => {
      const { status, schoolClass } = await setup(from);
      const res = await status("ARCHIVE");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ARCHIVED");
      const [event] = await events("class_plan.status_changed");
      expect(event!.metadata).toMatchObject({ classId: schoolClass.id, from, to: "ARCHIVED" });
    });

    it("depois de arquivado, toda escrita → 409 PLAN_ARCHIVED; nenhuma transição sai de ARCHIVED", async () => {
      const { topics, confirmed, schoolClass, client, status, write, revision } = await setup();
      await status("ARCHIVE");

      const attempts = [
        await write("post", "/topics", { title: "X", itemIds: [] }),
        await write("patch", `/topics/${topics[0]!.id}`, { title: "X" }),
        await write("post", `/topics/${topics[0]!.id}/archive`),
        await write("post", "/topics/merge", { topicIds: [topics[0]!.id, topics[1]!.id], title: "X", itemIds: [] }),
        await write("put", "/topic-order", { items: topics.map((topic) => ({ topicId: topic.id, meetingId: null })) }),
        await write("put", "/syllabus", { revisionId: confirmed.revision.id }),
        await client.put(`/api/classes/${schoolClass.id}/meetings`, { planRevision: revision(), add: ["2027-04-01"], remove: [], resolutions: [] }),
      ];
      for (const res of attempts) expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: "PLAN_ARCHIVED" });

      for (const action of ["CONFIRM", "REOPEN", "START"]) {
        const res = await status(action);
        expect({ action, status: res.status, code: res.body.code }).toEqual({ action, status: 409, code: "INVALID_STATE_TRANSITION" });
      }
      // Still readable.
      expect((await client.get(`/api/classes/${schoolClass.id}/plan`)).body.plan.status).toBe("ARCHIVED");
    });

    it("turma arquivada: planejamento somente leitura (409 PLAN_ARCHIVED), mas visível", async () => {
      const { schoolClass, status, write, client } = await setup();
      await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "ARCHIVED", statusChangedAt: new Date() } });

      for (const res of [await write("post", "/topics", { title: "X", itemIds: [] }), await status("CONFIRM")]) {
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: "PLAN_ARCHIVED" });
      }
      expect((await client.get(`/api/classes/${schoolClass.id}/plan`)).status).toBe(200);
    });
  });

  it("004/US7-7 cobertura com itens cobertos e não cobertos", async () => {
    const { client, base } = await setup("ACTIVE");
    const coverage = PlanCoverageSchema.parse((await client.get(`${base}/coverage`)).body);
    expect(coverage).toMatchObject({ coveredCount: 2, totalCount: 3 });
    expect(coverage.groups[0]!.items.map((item) => item.topicIds.length > 0)).toEqual([true, true, false]);
  });

  it("repetir a transição já aplicada → 200 sem novo registro e sem nova revisão", async () => {
    const { plan, status } = await setup();
    await status("CONFIRM");
    const again = await status("CONFIRM");
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ status: "READY", revision: plan.revision + 1 });
    expect(await events("class_plan.status_changed")).toHaveLength(1);
  });

  it("transição inválida (START de DRAFT) → 409 INVALID_STATE_TRANSITION; planRevision antigo → 409 PLAN_REVISION_CONFLICT", async () => {
    const { client, base, plan, status } = await setup();
    const invalid = await status("START");
    expect({ status: invalid.status, code: invalid.body.code }).toEqual({ status: 409, code: "INVALID_STATE_TRANSITION" });
    await status("CONFIRM");
    const stale = await client.post(`${base}/status`, { planRevision: plan.revision, action: "REOPEN" });
    expect({ status: stale.status, code: stale.body.code }).toEqual({ status: 409, code: "PLAN_REVISION_CONFLICT" });
  });

  it("sem planejamento → 404", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id);
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD });
    const res = await api(t, { cookie: await loginAs(t, teacher) }).post(`/api/classes/${schoolClass.id}/plan/status`, {
      planRevision: 1,
      action: "CONFIRM",
    });
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 404, code: "NOT_FOUND" });
  });

  it("004/FR-043 tópicos ativos identificáveis por id estável com classId e subjectId; arquivados continuam acessíveis", async () => {
    const { schoolClass, subject, topics, status, write, client, base } = await setup();
    await status("CONFIRM");
    await write("post", `/topics/${topics[1]!.id}/archive`);

    const view = ClassPlanViewSchema.parse((await client.get(base)).body.plan);
    expect(view.classId).toBe(schoolClass.id);
    expect(view.syllabus.subjectId).toBe(subject.id);
    expect(view.topics.map((topic) => [topic.id, topic.status])).toEqual([[topics[0]!.id, "ACTIVE"]]);
    const archived = TopicListSchema.parse((await client.get(`${base}/topics?status=ARCHIVED`)).body);
    expect(archived.items.map((topic) => topic.id)).toEqual([topics[1]!.id]);
  });
});
