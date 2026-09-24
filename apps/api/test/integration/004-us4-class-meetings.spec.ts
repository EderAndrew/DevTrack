import { ClassMeetingListSchema } from "@repo/contracts";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createClass,
  createConfirmedRevision,
  createMeetings,
  createPlan,
  createSubject,
  createSyllabusDocument,
  createTopic,
  createUser,
  dbDate,
  loginAs,
  type ClassOverrides,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

interface MeetingBody {
  id: string;
  date: string;
  number: number;
  status: string;
  topicCount: number;
}
interface MeetingListBody {
  items: MeetingBody[];
  total: number;
  planRevision: number | null;
}

const PERIOD = { startsOn: "2027-02-01", endsOn: "2027-06-30" };

/** Every date with the weekday `weekday` (0 = Sunday) in [from, to], as "YYYY-MM-DD". */
function weekdaysBetween(from: string, to: string, weekday: number): string[] {
  const dates: string[] = [];
  for (let day = dbDate(from); day <= dbDate(to); day = new Date(day.getTime() + 24 * 3600 * 1000)) {
    if (day.getUTCDay() === weekday) dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

describe("004/US4 — calendário de encontros da turma (FR-025 – FR-030)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
  });
  afterEach(async () => {
    // 004/SC-008: after every test, no topic points at a meeting that does not exist.
    const [orphans] = await t.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM topics t
      LEFT JOIN class_meetings m ON m.id = t.meeting_id
      WHERE t.meeting_id IS NOT NULL AND m.id IS NULL`;
    expect(orphans!.count).toBe(0);
  });

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  async function setup(overrides: ClassOverrides = {}) {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id, { name: "Programação Orientada a Objetos" });
    const schoolClass = await createClass(t, teacher.id, { subjectId: subject.id, ...PERIOD, ...overrides });
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const list = () => client.get(`/api/classes/${schoolClass.id}/meetings`);
    const save = (body: Partial<{ planRevision: number | null; add: string[]; remove: string[]; resolutions: object[] }>) =>
      client.put(`/api/classes/${schoolClass.id}/meetings`, {
        planRevision: null,
        add: [],
        remove: [],
        resolutions: [],
        ...body,
      });
    return { teacher, subject, schoolClass, client, list, save };
  }

  /** A plan for the class, on a confirmed revision of its subject, with `revision` as its counter. */
  async function planFor(classId: string, subjectId: string, overrides: Parameters<typeof createPlan>[3] = {}) {
    const document = await createSyllabusDocument(t, subjectId, { status: "PROCESSED" });
    const confirmed = await createConfirmedRevision(t, document.id, [{ title: "Fundamentos", items: ["Classes", "Objetos", "Herança"] }]);
    const plan = await createPlan(t, classId, confirmed.revision.id, overrides);
    return { plan, itemIds: confirmed.itemIds };
  }

  const meetingDates = async (classId: string) =>
    (await t.prisma.classMeeting.findMany({ where: { classId }, orderBy: { meetingDate: "asc" } })).map((m) =>
      m.meetingDate.toISOString().slice(0, 10),
    );

  it("004/US4-1 18 datas marcadas → 18 encontros PLANNED numerados de 1 a 18 por data", async () => {
    const { schoolClass, teacher, list, save } = await setup();
    const wednesdays = weekdaysBetween(PERIOD.startsOn, PERIOD.endsOn, 3).slice(0, 19);
    const dates = wednesdays.filter((date) => date !== "2027-03-17");
    expect(dates).toHaveLength(18);

    const res = await save({ add: [...dates].reverse() });

    expect(res.status).toBe(200);
    const body = ClassMeetingListSchema.parse(res.body) as MeetingListBody;
    expect(body.total).toBe(18);
    expect(body.planRevision).toBeNull();
    expect(body.items.map((m) => m.date)).toEqual(dates);
    expect(body.items.map((m) => m.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(body.items.every((m) => m.status === "PLANNED" && m.topicCount === 0)).toBe(true);
    expect((await list()).body).toEqual(body);

    const [event] = await events("class_meetings.updated");
    expect(event).toMatchObject({ actorUserId: teacher.id, targetType: "CLASS", targetId: schoolClass.id });
    expect(event!.metadata).toMatchObject({ added: 18, removed: 0, total: 18 });
  });

  it("004/US4-2 004/FR-026 aulas em 04/03, 11/03 e 25/03 → 3 encontros, sem motivo para 18/03", async () => {
    const { save } = await setup();
    const res = await save({ add: ["2027-03-04", "2027-03-11", "2027-03-25"] });

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect((res.body as MeetingListBody).items.map((m) => [m.number, m.date])).toEqual([
      [1, "2027-03-04"],
      [2, "2027-03-11"],
      [3, "2027-03-25"],
    ]);
  });

  describe("004/US4-3 datas fora do período, repetidas ou acima do limite", () => {
    it("data fora do período → 422 MEETING_OUT_OF_PERIOD, nada gravado", async () => {
      const { schoolClass, save } = await setup();
      for (const date of ["2027-01-31", "2027-07-01"]) {
        const res = await save({ add: ["2027-03-04", date] });
        expect(res.status, date).toBe(422);
        expect(res.body.code).toBe("MEETING_OUT_OF_PERIOD");
      }
      expect(await meetingDates(schoolClass.id)).toEqual([]);
      expect(await events("class_meetings.updated")).toHaveLength(0);
    });

    it("data repetida no pedido ou já existente → um encontro por data", async () => {
      const { schoolClass, save } = await setup();
      expect((await save({ add: ["2027-03-04", "2027-03-04"] })).body.total).toBe(1);
      const again = await save({ add: ["2027-03-04"], remove: ["2027-05-05"] });
      expect(again.status).toBe(200);
      expect(again.body.total).toBe(1);
      expect(await meetingDates(schoolClass.id)).toEqual(["2027-03-04"]);
    });

    it("201ª data → 422 TOO_MANY_MEETINGS; mais de 200 no pedido → 400", async () => {
      const { schoolClass, save } = await setup({ startsOn: "2027-01-01", endsOn: "2027-12-31" });
      const days = Array.from({ length: 201 }, (_, i) => new Date(dbDate("2027-01-01").getTime() + i * 24 * 3600 * 1000))
        .map((day) => day.toISOString().slice(0, 10));
      await createMeetings(t, schoolClass.id, days.slice(0, 200));

      const res = await save({ add: [days[200]!] });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("TOO_MANY_MEETINGS");
      expect((await save({ add: [days[199]!] })).status).toBe(200);

      const tooLong = await save({ add: days });
      expect(tooLong.status).toBe(400);
      expect(tooLong.body.code).toBe("VALIDATION_ERROR");
    });

    it("data inválida ou a mesma data para acrescentar e remover → 400", async () => {
      const { save } = await setup();
      expect((await save({ add: ["2027-02-30"] })).status).toBe(400);
      expect((await save({ add: ["2027-03-04"], remove: ["2027-03-04"] })).status).toBe(400);
    });
  });

  it("004/US4-4 data no meio renumera; os tópicos continuam nos mesmos encontros", async () => {
    const { schoolClass, subject, save } = await setup();
    const [first, last] = await createMeetings(t, schoolClass.id, ["2027-03-04", "2027-03-25"]);
    const { plan } = await planFor(schoolClass.id, subject.id);
    const topic = await createTopic(t, plan.id, { meetingId: last!.id });

    const res = await save({ planRevision: 1, add: ["2027-03-11"] });

    expect(res.status).toBe(200);
    const body = res.body as MeetingListBody;
    expect(body.planRevision).toBe(2);
    expect(body.items.map((m) => [m.number, m.date, m.topicCount])).toEqual([
      [1, "2027-03-04", 0],
      [2, "2027-03-11", 0],
      [3, "2027-03-25", 1],
    ]);
    expect(body.items[0]!.id).toBe(first!.id);
    expect(body.items[2]!.id).toBe(last!.id);
    expect((await t.prisma.topic.findUniqueOrThrow({ where: { id: topic.id } })).meetingId).toBe(last!.id);
    expect((await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision).toBe(2);
  });

  it("004/US4-5 remover data sem tópico apaga o encontro e renumera", async () => {
    const { schoolClass, teacher, save } = await setup();
    await createMeetings(t, schoolClass.id, ["2027-03-04", "2027-03-11", "2027-03-25"]);

    const res = await save({ remove: ["2027-03-11"] });

    expect(res.status).toBe(200);
    expect((res.body as MeetingListBody).items.map((m) => [m.number, m.date])).toEqual([
      [1, "2027-03-04"],
      [2, "2027-03-25"],
    ]);
    expect(await meetingDates(schoolClass.id)).toEqual(["2027-03-04", "2027-03-25"]);
    const [event] = await events("class_meetings.updated");
    expect(event).toMatchObject({ actorUserId: teacher.id, targetId: schoolClass.id });
    expect(event!.metadata).toMatchObject({ added: 0, removed: 1, total: 2 });
  });

  describe("004/US4-6 remover encontro com tópicos", () => {
    async function withTopics() {
      const context = await setup();
      const [early, middle, late] = await createMeetings(t, context.schoolClass.id, ["2027-03-04", "2027-03-11", "2027-03-25"]);
      const { plan, itemIds } = await planFor(context.schoolClass.id, context.subject.id);
      const other = await createTopic(t, plan.id, { title: "Classes", meetingId: early!.id, itemIds: [itemIds[0]!] });
      const toMove = await createTopic(t, plan.id, { title: "Mover", meetingId: middle!.id });
      const toUnschedule = await createTopic(t, plan.id, { title: "Sem data", meetingId: middle!.id });
      const toMerge = await createTopic(t, plan.id, { title: "Juntar", meetingId: middle!.id, itemIds: [itemIds[1]!] });
      const toArchive = await createTopic(t, plan.id, { title: "Arquivar", meetingId: middle!.id });
      return { ...context, plan, itemIds, early: early!, middle: middle!, late: late!, other, toMove, toUnschedule, toMerge, toArchive };
    }

    it("sem resolução → 409 MEETING_HAS_TOPICS no formato padrão, nada mudado", async () => {
      const { schoolClass, plan, middle, save } = await withTopics();

      const res = await save({ planRevision: 1, remove: ["2027-03-11"], add: ["2027-03-18"] });

      expect(res.status).toBe(409);
      expect(res.body).toEqual({ statusCode: 409, code: "MEETING_HAS_TOPICS", message: expect.any(String) });
      expect(await meetingDates(schoolClass.id)).toEqual(["2027-03-04", "2027-03-11", "2027-03-25"]);
      expect(await t.prisma.topic.count({ where: { meetingId: middle.id } })).toBe(4);
      expect((await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision).toBe(1);
      expect(await events("class_meetings.updated")).toHaveLength(0);
    });

    it("resolução parcial → 409 MEETING_HAS_TOPICS, nenhuma resolução aplicada", async () => {
      const { toMove, save } = await withTopics();
      const res = await save({
        planRevision: 1,
        remove: ["2027-03-11"],
        resolutions: [{ topicId: toMove.id, action: "UNSCHEDULE" }],
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("MEETING_HAS_TOPICS");
      expect((await t.prisma.topic.findUniqueOrThrow({ where: { id: toMove.id } })).meetingId).not.toBeNull();
    });

    it("MOVE, UNSCHEDULE, MERGE e ARCHIVE → encontro removido, nenhum tópico apagado, um registro por tópico", async () => {
      const { schoolClass, teacher, plan, itemIds, other, toMove, toUnschedule, toMerge, toArchive, save } = await withTopics();
      const topicsBefore = await t.prisma.topic.count();

      const res = await save({
        planRevision: 1,
        add: ["2027-03-18"],
        remove: ["2027-03-11"],
        resolutions: [
          { topicId: toMove.id, action: "MOVE", meetingDate: "2027-03-18" },
          { topicId: toUnschedule.id, action: "UNSCHEDULE" },
          { topicId: toMerge.id, action: "MERGE", intoTopicId: other.id },
          { topicId: toArchive.id, action: "ARCHIVE" },
        ],
      });

      expect(res.status).toBe(200);
      const body = res.body as MeetingListBody;
      expect(body.planRevision).toBe(2);
      expect(body.items.map((m) => [m.number, m.date, m.topicCount])).toEqual([
        [1, "2027-03-04", 1],
        [2, "2027-03-18", 1],
        [3, "2027-03-25", 0],
      ]);
      expect(await t.prisma.topic.count()).toBe(topicsBefore);

      const byId = async (id: string) =>
        t.prisma.topic.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { itemId: "asc" } } } });
      expect((await byId(toMove.id)).meetingId).toBe(body.items[1]!.id);
      expect((await byId(toUnschedule.id)).meetingId).toBeNull();
      expect(await byId(toMerge.id)).toMatchObject({
        status: "ARCHIVED",
        statusBeforeArchive: "DRAFT",
        mergedIntoTopicId: other.id,
        meetingId: null,
      });
      expect((await byId(other.id)).items.map((link) => link.itemId).sort()).toEqual([itemIds[0], itemIds[1]].sort());
      const archived = await byId(toArchive.id);
      expect(archived).toMatchObject({ status: "ARCHIVED", statusBeforeArchive: "DRAFT", meetingId: null });
      expect(archived.archivedAt).not.toBeNull();

      const [updated] = await events("class_meetings.updated");
      expect(updated).toMatchObject({ actorUserId: teacher.id, targetType: "CLASS", targetId: schoolClass.id });
      expect(updated!.metadata).toEqual({
        added: 1,
        removed: 1,
        total: 3,
        resolutions: { MOVE: 1, UNSCHEDULE: 1, MERGE: 1, ARCHIVE: 1 },
      });
      const topicUpdates = await events("topic.updated");
      expect(topicUpdates.map((e) => e.targetId).sort()).toEqual([toMove.id, toUnschedule.id].sort());
      expect(topicUpdates.map((e) => e.metadata)).toEqual([
        { planId: plan.id, fields: ["meetingId"] },
        { planId: plan.id, fields: ["meetingId"] },
      ]);
      const merged = await events("topic.merged");
      expect(merged).toHaveLength(1);
      expect(merged[0]).toMatchObject({ targetType: "TOPIC", targetId: other.id, metadata: { planId: plan.id, mergedTopicIds: [toMerge.id] } });
      const archivedEvents = await events("topic.archived");
      expect(archivedEvents).toHaveLength(1);
      expect(archivedEvents[0]).toMatchObject({ targetId: toArchive.id, metadata: { planId: plan.id, reason: "MEETING_REMOVED" } });
    });

    it("MOVE para data que não existirá, MERGE no próprio tópico e tópico de outra área são recusados", async () => {
      const { toMove, toUnschedule, toMerge, toArchive, save } = await withTopics();
      const rest = [
        { topicId: toUnschedule.id, action: "UNSCHEDULE" },
        { topicId: toMerge.id, action: "UNSCHEDULE" },
        { topicId: toArchive.id, action: "UNSCHEDULE" },
      ];
      const moveToRemoved = await save({
        planRevision: 1,
        remove: ["2027-03-11"],
        resolutions: [{ topicId: toMove.id, action: "MOVE", meetingDate: "2027-03-11" }, ...rest],
      });
      expect(moveToRemoved.status).toBe(400);
      expect(moveToRemoved.body.code).toBe("VALIDATION_ERROR");

      const mergeIntoItself = await save({
        planRevision: 1,
        remove: ["2027-03-11"],
        resolutions: [{ topicId: toMove.id, action: "MERGE", intoTopicId: toMove.id }, ...rest],
      });
      expect(mergeIntoItself.status).toBe(400);

      const stranger = await setup();
      const { plan: strangerPlan } = await planFor(stranger.schoolClass.id, stranger.subject.id);
      const foreign = await createTopic(t, strangerPlan.id);
      const mergeIntoForeign = await save({
        planRevision: 1,
        remove: ["2027-03-11"],
        resolutions: [{ topicId: toMove.id, action: "MERGE", intoTopicId: foreign.id }, ...rest],
      });
      expect(mergeIntoForeign.status).toBe(404);
      const resolveForeign = await save({
        planRevision: 1,
        remove: ["2027-03-11"],
        resolutions: [{ topicId: foreign.id, action: "ARCHIVE" }],
      });
      expect(resolveForeign.status).toBe(404);
      expect((await t.prisma.topic.findUniqueOrThrow({ where: { id: foreign.id } })).status).not.toBe("ARCHIVED");
    });
  });

  it("004/US4-7 PATCH das datas que deixaria encontros de fora → 409 MEETINGS_OUTSIDE_PERIOD; depois de desmarcá-los, aceito", async () => {
    const { schoolClass, client, save } = await setup();
    await createMeetings(t, schoolClass.id, ["2027-03-04", "2027-06-02"]);
    const shorter = { startsOn: "2027-02-01", endsOn: "2027-05-31" };

    const refused = await client.patch(`/api/classes/${schoolClass.id}`, shorter);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("MEETINGS_OUTSIDE_PERIOD");
    expect((await client.get(`/api/classes/${schoolClass.id}`)).body.endsOn).toBe(PERIOD.endsOn);
    const later = await client.patch(`/api/classes/${schoolClass.id}`, { startsOn: "2027-03-05", endsOn: "2027-06-30" });
    expect(later.body.code).toBe("MEETINGS_OUTSIDE_PERIOD");

    expect((await save({ remove: ["2027-06-02"] })).status).toBe(200);
    const accepted = await client.patch(`/api/classes/${schoolClass.id}`, shorter);
    expect(accepted.status).toBe(200);
    expect(accepted.body.endsOn).toBe("2027-05-31");
    expect((await client.patch(`/api/classes/${schoolClass.id}`, { name: "Outro nome" })).status).toBe(200);
  });

  it("004/SC-008 o banco recusa apagar direto um encontro com tópico", async () => {
    const { schoolClass, subject } = await setup();
    const [meeting] = await createMeetings(t, schoolClass.id, ["2027-03-04"]);
    const { plan } = await planFor(schoolClass.id, subject.id);
    await createTopic(t, plan.id, { meetingId: meeting!.id });

    await expect(t.prisma.classMeeting.delete({ where: { id: meeting!.id } })).rejects.toThrow();
    expect(await t.prisma.classMeeting.count({ where: { id: meeting!.id } })).toBe(1);
  });

  it("turma sem disciplina ou sem datas → 422 CLASS_NOT_PLANNABLE", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const subject = await createSubject(t, teacher.id);
    for (const overrides of [{ ...PERIOD }, { subjectId: subject.id }]) {
      const schoolClass = await createClass(t, teacher.id, overrides);
      const read = await client.get(`/api/classes/${schoolClass.id}/meetings`);
      expect(read.status).toBe(422);
      expect(read.body.code).toBe("CLASS_NOT_PLANNABLE");
      const write = await client.put(`/api/classes/${schoolClass.id}/meetings`, {
        planRevision: null,
        add: ["2027-03-04"],
        remove: [],
        resolutions: [],
      });
      expect(write.body.code).toBe("CLASS_NOT_PLANNABLE");
    }
  });

  describe("com planejamento", () => {
    it("004/FR-041 planRevision antigo ou nulo → 409 PLAN_REVISION_CONFLICT; o atual → aceito e incrementado", async () => {
      const { schoolClass, subject, save, list } = await setup();
      const { plan } = await planFor(schoolClass.id, subject.id, { revision: 3 });

      for (const planRevision of [2, null]) {
        const res = await save({ planRevision, add: ["2027-03-04"] });
        expect(res.status, String(planRevision)).toBe(409);
        expect(res.body.code).toBe("PLAN_REVISION_CONFLICT");
      }
      expect(await meetingDates(schoolClass.id)).toEqual([]);
      expect((await list()).body.planRevision).toBe(3);

      const ok = await save({ planRevision: 3, add: ["2027-03-04"] });
      expect(ok.status).toBe(200);
      expect(ok.body.planRevision).toBe(4);
      expect((await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })).revision).toBe(4);
    });

    it("planejamento ARCHIVED → 409 PLAN_ARCHIVED; turma arquivada também, mas a leitura continua", async () => {
      const { schoolClass, subject, save, list } = await setup();
      await planFor(schoolClass.id, subject.id, { status: "ARCHIVED" });
      const res = await save({ planRevision: 1, add: ["2027-03-04"] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PLAN_ARCHIVED");

      await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "ARCHIVED" } });
      expect((await save({ planRevision: 1, add: ["2027-03-04"] })).body.code).toBe("PLAN_ARCHIVED");
      expect((await list()).status).toBe(200);
    });

    it("sem planejamento, planRevision informado → 409 PLAN_REVISION_CONFLICT", async () => {
      const { save } = await setup();
      const res = await save({ planRevision: 1, add: ["2027-03-04"] });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PLAN_REVISION_CONFLICT");
    });
  });

  it("turma de outro professor → 404 na leitura e na gravação", async () => {
    const owner = await setup();
    const intruder = await createUser(t, { roles: ["TEACHER"] });
    const client = api(t, { cookie: await loginAs(t, intruder) });
    expect((await client.get(`/api/classes/${owner.schoolClass.id}/meetings`)).status).toBe(404);
    const write = await client.put(`/api/classes/${owner.schoolClass.id}/meetings`, {
      planRevision: null,
      add: ["2027-03-04"],
      remove: [],
      resolutions: [],
    });
    expect(write.status).toBe(404);
    expect(await meetingDates(owner.schoolClass.id)).toEqual([]);
  });

  it("datas passadas dentro do período são aceitas", async () => {
    const { save } = await setup({ startsOn: "2020-02-03", endsOn: "2020-06-30", academicYear: 2020 });
    const res = await save({ add: ["2020-03-04"] });
    expect(res.status).toBe(200);
    expect(res.body.items).toMatchObject([{ number: 1, date: "2020-03-04" }]);
  });
});
