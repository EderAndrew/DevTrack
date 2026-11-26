import { ClassMeetingListSchema } from "@repo/contracts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import {
  createClass,
  createConfirmedRevision,
  createPlan,
  createSubject,
  createSyllabusDocument,
  createTopic,
  createUser,
  loginAs,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

// 031 US2 (spec.md), FR-008, research CK3: a meeting with topics that stops being a meeting follows 004/FR-029.
const PERIOD = { startsOn: "2027-02-01", endsOn: "2027-06-30" };
const NON_MEETING = [
  { kind: "HOLIDAY", description: "Feriado municipal" },
  { kind: "RECESS", description: "Recesso" },
  { kind: "SPECIAL_EVENT", description: "Semana acadêmica" },
  { kind: "TEACHER_ABSENCE", absenceReason: "Consulta médica" },
] as const;

type SaveBody = Partial<{
  add: string[];
  set: object[];
  remove: string[];
  resolutions: object[];
}>;

describe("031/US2 — dia com tópicos que deixa de ser aula", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));
  afterEach(async () => {
    // 004/SC-008: no topic ever points at a meeting that does not exist.
    const [orphans] = await t.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM topics t
      LEFT JOIN class_meetings m ON m.id = t.meeting_id
      WHERE t.meeting_id IS NOT NULL AND m.id IS NULL`;
    expect(orphans!.count).toBe(0);
  });

  /** A class with meetings on 03/03, 10/03, 17/03 and 24/03, an ACTIVE plan and topics on 10/03 (one completed). */
  async function setup() {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id, {
      name: "Programação Orientada a Objetos",
    });
    const schoolClass = await createClass(t, teacher.id, {
      subjectId: subject.id,
      ...PERIOD,
    });
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const base = `/api/classes/${schoolClass.id}/meetings`;
    await client.put(base, {
      planRevision: null,
      add: ["2027-03-03", "2027-03-10", "2027-03-17", "2027-03-24"],
      remove: [],
      resolutions: [],
    });

    const document = await createSyllabusDocument(t, subject.id, {
      status: "PROCESSED",
    });
    const confirmed = await createConfirmedRevision(t, document.id, [
      { title: "Fundamentos", items: ["Classes", "Objetos"] },
    ]);
    const plan = await createPlan(t, schoolClass.id, confirmed.revision.id, {
      status: "ACTIVE",
    });
    const meetings = await t.prisma.classMeeting.findMany({
      where: { classId: schoolClass.id },
      orderBy: { meetingDate: "asc" },
    });
    const byDate = (date: string) =>
      meetings.find((m) => m.meetingDate.toISOString().startsWith(date))!;
    const other = await createTopic(t, plan.id, {
      title: "Classes",
      meetingId: byDate("2027-03-03").id,
    });
    const toMove = await createTopic(t, plan.id, {
      title: "Encapsulamento",
      meetingId: byDate("2027-03-10").id,
    });
    const toUnschedule = await createTopic(t, plan.id, {
      title: "Construtores",
      meetingId: byDate("2027-03-10").id,
    });
    const toMerge = await createTopic(t, plan.id, {
      title: "Getters",
      meetingId: byDate("2027-03-10").id,
    });
    const toArchive = await createTopic(t, plan.id, {
      title: "Exercícios",
      meetingId: byDate("2027-03-10").id,
    });
    const completed = await createTopic(t, plan.id, {
      title: "Objetos",
      meetingId: byDate("2027-03-10").id,
      status: "COMPLETED",
    });

    const revision = async () =>
      (await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } }))
        .revision;
    const save = async (body: SaveBody, planRevision?: number) =>
      client.put(base, {
        planRevision: planRevision ?? (await revision()),
        add: [],
        remove: [],
        resolutions: [],
        ...body,
      });
    const list = async () =>
      ClassMeetingListSchema.parse((await client.get(base)).body);
    return {
      schoolClass,
      client,
      plan,
      byDate,
      topics: { other, toMove, toUnschedule, toMerge, toArchive, completed },
      save,
      list,
      revision,
    };
  }

  const topicRows = (planId: string) =>
    t.prisma.topic.findMany({
      where: { planId },
      orderBy: { position: "asc" },
      select: { id: true, status: true, meetingId: true },
    });

  it("031/US2-1 031/US2-3 mudar um encontro com tópicos para cada tipo que não é aula sem resoluções → 409, nada muda", async () => {
    const { save, list, plan, revision } = await setup();
    const before = await list();
    const topicsBefore = await topicRows(plan.id);
    const revisionBefore = await revision();
    const eventsBefore = await t.prisma.auditEvent.count({
      where: { type: "class_meetings.updated" },
    });

    for (const entry of NON_MEETING) {
      const res = await save({
        add: ["2027-03-31"],
        set: [{ date: "2027-03-10", ...entry }],
      });
      expect(res.status, entry.kind).toBe(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        code: "MEETING_HAS_TOPICS",
      });
    }

    // Neither the kind nor the other items of the save changed; the revision is untouched (rolled back).
    expect(await list()).toEqual(before);
    expect(await topicRows(plan.id)).toEqual(topicsBefore);
    expect(await revision()).toBe(revisionBefore);
    expect(
      await t.prisma.auditEvent.count({
        where: { type: "class_meetings.updated" },
      }),
    ).toBe(eventsBefore);
  });

  it("031/US2-2 031/SC-003 com MOVE, UNSCHEDULE, MERGE e ARCHIVE a gravação aplica tudo; o dia vira Falta e nenhum tópico se perde", async () => {
    const { save, list, plan, byDate, topics } = await setup();
    const countBefore = await t.prisma.topic.count({
      where: { planId: plan.id },
    });

    const res = await save({
      set: [
        {
          date: "2027-03-10",
          kind: "TEACHER_ABSENCE",
          absenceReason: "Consulta médica",
          absenceNotice: "Atividade no portal.",
        },
      ],
      resolutions: [
        {
          topicId: topics.toMove.id,
          action: "MOVE",
          meetingDate: "2027-03-17",
        },
        { topicId: topics.toUnschedule.id, action: "UNSCHEDULE" },
        {
          topicId: topics.toMerge.id,
          action: "MERGE",
          intoTopicId: topics.other.id,
        },
        { topicId: topics.toArchive.id, action: "ARCHIVE" },
        { topicId: topics.completed.id, action: "ARCHIVE" },
      ],
    });

    expect(res.status).toBe(200);
    const body = await list();
    expect(body.items.map(({ date, number }) => ({ date, number }))).toEqual([
      { date: "2027-03-03", number: 1 },
      { date: "2027-03-17", number: 2 },
      { date: "2027-03-24", number: 3 },
    ]);
    expect(body.days).toEqual([
      {
        date: "2027-03-10",
        kind: "TEACHER_ABSENCE",
        description: null,
        absenceReason: "Consulta médica",
        absenceNotice: "Atividade no portal.",
      },
    ]);

    expect(await t.prisma.topic.count({ where: { planId: plan.id } })).toBe(
      countBefore,
    );
    const rows = new Map(
      (await topicRows(plan.id)).map((row) => [row.id, row]),
    );
    expect(rows.get(topics.toMove.id)).toMatchObject({
      status: "ACTIVE",
      meetingId: byDate("2027-03-17").id,
    });
    expect(rows.get(topics.toUnschedule.id)).toMatchObject({
      status: "ACTIVE",
      meetingId: null,
    });
    expect(rows.get(topics.toMerge.id)).toMatchObject({
      status: "ARCHIVED",
      meetingId: null,
    });
    expect(rows.get(topics.toArchive.id)).toMatchObject({
      status: "ARCHIVED",
      meetingId: null,
    });
    expect(rows.get(topics.completed.id)).toMatchObject({
      status: "ARCHIVED",
      meetingId: null,
    });

    const [event] = await t.prisma.auditEvent.findMany({
      where: { type: "class_meetings.updated" },
      orderBy: { id: "desc" },
      take: 1,
    });
    expect(event!.metadata).toMatchObject({
      added: 0,
      removed: 0,
      changed: 1,
      total: 3,
      resolutions: { MOVE: 1, UNSCHEDULE: 1, MERGE: 1, ARCHIVE: 2 },
      kinds: { CLASS: 3, TEACHER_ABSENCE: 1 },
    });
  });

  it("o tópico concluído só aceita ARCHIVE (409 INVALID_STATE_TRANSITION para os outros), nada muda", async () => {
    const { save, list, topics } = await setup();
    const before = await list();
    const others = [
      { topicId: topics.toMove.id, action: "ARCHIVE" },
      { topicId: topics.toUnschedule.id, action: "ARCHIVE" },
      { topicId: topics.toMerge.id, action: "ARCHIVE" },
      { topicId: topics.toArchive.id, action: "ARCHIVE" },
    ];
    for (const resolution of [
      {
        topicId: topics.completed.id,
        action: "MOVE",
        meetingDate: "2027-03-17",
      },
      { topicId: topics.completed.id, action: "UNSCHEDULE" },
      {
        topicId: topics.completed.id,
        action: "MERGE",
        intoTopicId: topics.other.id,
      },
    ]) {
      const res = await save({
        set: [{ date: "2027-03-10", kind: "HOLIDAY", description: "Feriado" }],
        resolutions: [...others, resolution],
      });
      expect(res.status, resolution.action).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    }
    expect(await list()).toEqual(before);
  });

  it("MOVE para uma data que vira Feriado na mesma gravação → 400, nada muda", async () => {
    const { save, list, topics } = await setup();
    const before = await list();
    const res = await save({
      set: [
        { date: "2027-03-10", kind: "SPECIAL_EVENT", description: "Palestra" },
        { date: "2027-03-17", kind: "HOLIDAY", description: "Feriado" },
      ],
      resolutions: [
        {
          topicId: topics.toMove.id,
          action: "MOVE",
          meetingDate: "2027-03-17",
        },
        { topicId: topics.toUnschedule.id, action: "UNSCHEDULE" },
        { topicId: topics.toMerge.id, action: "UNSCHEDULE" },
        { topicId: topics.toArchive.id, action: "ARCHIVE" },
        { topicId: topics.completed.id, action: "ARCHIVE" },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(await list()).toEqual(before);
  });

  it("031/US2-4 Aula → Prova mantém os tópicos sem pedir resolução", async () => {
    const { save, list, plan, byDate } = await setup();
    const topicsBefore = await topicRows(plan.id);

    const res = await save({
      set: [{ date: "2027-03-10", kind: "EXAM", description: "P1" }],
    });

    expect(res.status).toBe(200);
    const meeting = (await list()).items.find(
      (item) => item.date === "2027-03-10",
    )!;
    expect(meeting).toMatchObject({
      id: byDate("2027-03-10").id,
      number: 2,
      kind: "EXAM",
      description: "P1",
      topicCount: 6 - 1,
    });
    expect(await topicRows(plan.id)).toEqual(topicsBefore);
  });

  it("031/US2-5 a mudança de período com encontros fora segue 409 MEETINGS_OUTSIDE_PERIOD; os dias sem aula fora saem com ela", async () => {
    const { schoolClass, client, save, list } = await setup();
    await save({
      set: [{ date: "2027-06-23", kind: "RECESS", description: "Recesso" }],
    });

    const refused = await client.patch(`/api/classes/${schoolClass.id}`, {
      startsOn: "2027-03-15",
      endsOn: "2027-06-30",
    });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("MEETINGS_OUTSIDE_PERIOD");
    expect((await list()).days).toHaveLength(1);

    const accepted = await client.patch(`/api/classes/${schoolClass.id}`, {
      startsOn: "2027-02-01",
      endsOn: "2027-05-31",
    });
    expect(accepted.status).toBe(200);
    expect((await list()).days).toEqual([]);
  });

  it("concorrência: duas gravações com o mesmo planRevision → uma grava, a outra 409 PLAN_REVISION_CONFLICT", async () => {
    const { save, list, revision } = await setup();
    const planRevision = await revision();

    const results = await Promise.all([
      save(
        {
          set: [
            { date: "2027-03-31", kind: "HOLIDAY", description: "Feriado" },
          ],
        },
        planRevision,
      ),
      save(
        { set: [{ date: "2027-03-31", kind: "EXAM", description: "P1" }] },
        planRevision,
      ),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(results.find((res) => res.status === 409)!.body.code).toBe(
      "PLAN_REVISION_CONFLICT",
    );
    // One mark on the date, never both (031/FR-013, CK2).
    const after = await list();
    const marks = [
      ...after.items.map((item) => item.date),
      ...after.days.map((day) => day.date),
    ].filter((date) => date === "2027-03-31");
    expect(marks).toHaveLength(1);
  });
});
