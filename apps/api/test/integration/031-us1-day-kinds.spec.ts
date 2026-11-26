import {
  ClassMeetingListSchema,
  ClassPlanEnvelopeSchema,
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
  dbDate,
  loginAs,
} from "../helpers/factories";
import { captureLogs } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

// 031 US1 (spec.md), contracts/http-api.md "PUT /classes/:id/meetings", research CK3, CK5 and CK11.
const PERIOD = { startsOn: "2027-02-01", endsOn: "2027-06-30" };
const DESCRIPTION = "MARCADOR-DESCRICAO-031";
const REASON = "MARCADOR-MOTIVO-031";
const NOTICE = "MARCADOR-AVISO-031";

/** Every date with the weekday `weekday` (0 = Sunday) in [from, to], as "YYYY-MM-DD". */
function weekdaysBetween(from: string, to: string, weekday: number): string[] {
  const dates: string[] = [];
  for (
    let day = dbDate(from);
    day <= dbDate(to);
    day = new Date(day.getTime() + 24 * 3600 * 1000)
  ) {
    if (day.getUTCDay() === weekday) dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

type SaveBody = Partial<{
  planRevision: number | null;
  add: string[];
  set: object[];
  remove: string[];
  resolutions: object[];
}>;

describe("031/US1 — o professor dá um tipo a cada dia do calendário", () => {
  const logs = captureLogs();
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ logs });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
  });

  const events = (type: string) =>
    t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  async function setup(cohortId?: string) {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const subject = await createSubject(t, teacher.id, {
      name: `Disciplina ${Math.random().toString(36).slice(2, 8)}`,
    });
    const schoolClass = await createClass(t, teacher.id, {
      subjectId: subject.id,
      cohortId,
      ...PERIOD,
    });
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const list = async () =>
      ClassMeetingListSchema.parse(
        (await client.get(`/api/classes/${schoolClass.id}/meetings`)).body,
      );
    const save = (body: SaveBody) =>
      client.put(`/api/classes/${schoolClass.id}/meetings`, {
        planRevision: null,
        add: [],
        remove: [],
        resolutions: [],
        ...body,
      });
    return { teacher, subject, schoolClass, client, list, save };
  }

  async function planFor(classId: string, subjectId: string) {
    const document = await createSyllabusDocument(t, subjectId, {
      status: "PROCESSED",
    });
    const confirmed = await createConfirmedRevision(t, document.id, [
      { title: "Fundamentos", items: ["Classes", "Objetos"] },
    ]);
    return createPlan(t, classId, confirmed.revision.id, { status: "ACTIVE" });
  }

  it("031/US1-7 uma gravação com add, set e remove aplica tudo numa operação", async () => {
    const { schoolClass, save, list } = await setup();
    await createMeetings(t, schoolClass.id, ["2027-03-03", "2027-03-10"]);

    const res = await save({
      add: ["2027-03-17"],
      set: [
        { date: "2027-03-10", kind: "EXAM", description: "P1 — Herança" },
        {
          date: "2027-03-24",
          kind: "HOLIDAY",
          description: "Feriado municipal",
        },
        {
          date: "2027-03-31",
          kind: "TEACHER_ABSENCE",
          absenceReason: "Consulta médica",
          absenceNotice: " Atividade no portal. ",
        },
      ],
      remove: ["2027-03-03"],
    });

    expect(res.status).toBe(200);
    const body = ClassMeetingListSchema.parse(res.body);
    expect(body).toEqual(await list());
    expect(
      body.items.map(({ date, number, kind, description }) => ({
        date,
        number,
        kind,
        description,
      })),
    ).toEqual([
      {
        date: "2027-03-10",
        number: 1,
        kind: "EXAM",
        description: "P1 — Herança",
      },
      { date: "2027-03-17", number: 2, kind: "CLASS", description: null },
    ]);
    expect(body.days).toEqual([
      {
        date: "2027-03-24",
        kind: "HOLIDAY",
        description: "Feriado municipal",
        absenceReason: null,
        absenceNotice: null,
      },
      {
        date: "2027-03-31",
        kind: "TEACHER_ABSENCE",
        description: null,
        absenceReason: "Consulta médica",
        absenceNotice: "Atividade no portal.",
      },
    ]);
    expect(body.total).toBe(2);
    expect(await events("class_meetings.updated")).toHaveLength(1);
  });

  it("031/US1-8 031/SC-002 o total e a numeração contam só Aula, Prova, Trabalho, Revisão e Reposição", async () => {
    const { save } = await setup();
    const wednesdays = weekdaysBetween("2027-02-03", "2027-06-30", 3).slice(
      0,
      19,
    );
    const set = [
      ...wednesdays.slice(0, 16).map((date) => ({ date, kind: "CLASS" })),
      { date: wednesdays[16], kind: "EXAM", description: "P1" },
      { date: wednesdays[17], kind: "HOLIDAY", description: "Tiradentes" },
      {
        date: wednesdays[18],
        kind: "SPECIAL_EVENT",
        description: "Semana acadêmica",
      },
      { date: "2027-02-05", kind: "ASSIGNMENT", description: "Entrega T1" },
      { date: "2027-02-06", kind: "REVIEW", description: "Revisão" },
      { date: "2027-02-07", kind: "MAKEUP", description: "Reposição" },
      { date: "2027-02-08", kind: "RECESS", description: "Recesso" },
      {
        date: "2027-02-09",
        kind: "TEACHER_ABSENCE",
        absenceReason: "Consulta",
      },
    ];

    const body = ClassMeetingListSchema.parse((await save({ set })).body);

    expect(body.total).toBe(20);
    expect(body.items).toHaveLength(20);
    expect(body.items.map((meeting) => meeting.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(body.items.map((meeting) => meeting.date)).toEqual(
      [...body.items.map((meeting) => meeting.date)].sort(),
    );
    expect(body.days.map((day) => day.kind)).toEqual([
      "RECESS",
      "TEACHER_ABSENCE",
      "HOLIDAY",
      "SPECIAL_EVENT",
    ]);
    const [event] = await events("class_meetings.updated");
    expect(event!.metadata).toMatchObject({
      added: 24,
      removed: 0,
      total: 20,
      changed: 0,
      kinds: {
        CLASS: 16,
        EXAM: 1,
        ASSIGNMENT: 1,
        REVIEW: 1,
        MAKEUP: 1,
        HOLIDAY: 1,
        RECESS: 1,
        SPECIAL_EVENT: 1,
        TEACHER_ABSENCE: 1,
      },
    });
  });

  it("031/US1-10 031/FR-006 Prova → Aula limpa a descrição; Falta → Feriado limpa motivo e aviso", async () => {
    const { save } = await setup();
    await save({
      set: [
        { date: "2027-03-10", kind: "EXAM", description: "P1" },
        {
          date: "2027-03-17",
          kind: "TEACHER_ABSENCE",
          absenceReason: "Consulta",
          absenceNotice: "Aviso",
        },
      ],
    });

    const body = ClassMeetingListSchema.parse(
      (
        await save({
          set: [
            { date: "2027-03-10", kind: "CLASS" },
            { date: "2027-03-17", kind: "HOLIDAY", description: "Feriado" },
          ],
        })
      ).body,
    );

    expect(body.items).toEqual([
      expect.objectContaining({
        date: "2027-03-10",
        kind: "CLASS",
        description: null,
      }),
    ]);
    expect(body.days).toEqual([
      {
        date: "2027-03-17",
        kind: "HOLIDAY",
        description: "Feriado",
        absenceReason: null,
        absenceNotice: null,
      },
    ]);
    const [, second] = await events("class_meetings.updated");
    expect(second!.metadata).toMatchObject({
      added: 0,
      removed: 0,
      changed: 2,
    });
  });

  it("031/US1-11 031/SC-007 encontros criados pela 004 voltam como Aula, com a mesma numeração e os mesmos tópicos", async () => {
    const { schoolClass, subject, save, list } = await setup();
    await save({ add: ["2027-03-03", "2027-03-10", "2027-03-17"] });
    const plan = await planFor(schoolClass.id, subject.id);
    const before = await list();
    await createTopic(t, plan.id, {
      title: "Classes",
      meetingId: before.items[1]!.id,
    });

    const after = await list();
    expect(after.total).toBe(3);
    expect(after.days).toEqual([]);
    expect(
      after.items.map(({ date, number, kind, description }) => ({
        date,
        number,
        kind,
        description,
      })),
    ).toEqual([
      { date: "2027-03-03", number: 1, kind: "CLASS", description: null },
      { date: "2027-03-10", number: 2, kind: "CLASS", description: null },
      { date: "2027-03-17", number: 3, kind: "CLASS", description: null },
    ]);
    expect(after.items[1]!.topicCount).toBe(1);

    // Aula → Prova keeps the meeting (same id, number and topic).
    const exam = ClassMeetingListSchema.parse(
      (
        await save({
          planRevision: plan.revision,
          set: [{ date: "2027-03-10", kind: "EXAM", description: "P1" }],
        })
      ).body,
    );
    expect(exam.items[1]).toMatchObject({
      id: before.items[1]!.id,
      number: 2,
      kind: "EXAM",
      topicCount: 1,
    });
  });

  it("031/FR-004 031/FR-005 corpos inválidos por tipo → 400; nada gravado", async () => {
    const { save, list } = await setup();
    const invalid: object[] = [
      { date: "2027-03-10", kind: "CLASS", description: "Aula" },
      { date: "2027-03-10", kind: "EXAM" },
      { date: "2027-03-10", kind: "HOLIDAY", description: "   " },
      {
        date: "2027-03-10",
        kind: "SPECIAL_EVENT",
        description: "x".repeat(121),
      },
      { date: "2027-03-10", kind: "TEACHER_ABSENCE" },
      {
        date: "2027-03-10",
        kind: "TEACHER_ABSENCE",
        absenceReason: "x".repeat(501),
      },
      {
        date: "2027-03-10",
        kind: "TEACHER_ABSENCE",
        absenceReason: "Consulta",
        absenceNotice: "x".repeat(201),
      },
      {
        date: "2027-03-10",
        kind: "TEACHER_ABSENCE",
        absenceReason: "Consulta",
        description: "Falta",
      },
      {
        date: "2027-03-10",
        kind: "HOLIDAY",
        description: "Feriado",
        absenceReason: "x",
      },
      { date: "2027-03-10", kind: "CANCELLED" },
    ];
    for (const entry of invalid) {
      const res = await save({ set: [entry] });
      expect(res.status, JSON.stringify(entry)).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
    }
    // A date in more than one of add/set/remove, or twice in set.
    expect(
      (
        await save({
          add: ["2027-03-10"],
          set: [{ date: "2027-03-10", kind: "CLASS" }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await save({
          remove: ["2027-03-10"],
          set: [{ date: "2027-03-10", kind: "CLASS" }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await save({
          set: [
            { date: "2027-03-10", kind: "CLASS" },
            { date: "2027-03-10", kind: "EXAM", description: "P1" },
          ],
        })
      ).status,
    ).toBe(400);
    // `add` of a day without class is ambiguous: use `set`.
    await save({
      set: [{ date: "2027-03-24", kind: "HOLIDAY", description: "Feriado" }],
    });
    expect((await save({ add: ["2027-03-24"] })).status).toBe(400);

    expect(await list()).toMatchObject({ items: [], total: 0 });
    expect((await list()).days).toHaveLength(1);
  });

  it("data fora do período em set → 422 MEETING_OUT_OF_PERIOD, nada gravado", async () => {
    const { save, list } = await setup();
    for (const entry of [
      { date: "2027-01-31", kind: "HOLIDAY", description: "Antes" },
      { date: "2027-07-01", kind: "CLASS" },
    ]) {
      const res = await save({
        set: [{ date: "2027-03-10", kind: "CLASS" }, entry],
      });
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("MEETING_OUT_OF_PERIOD");
    }
    expect(await list()).toEqual({
      items: [],
      days: [],
      total: 0,
      planRevision: null,
    });
  });

  it("031/FR-013 outra disciplina da mesma turma, de outro professor → 404; as marcações de uma não aparecem na outra", async () => {
    const mine = await setup();
    const other = await setup(mine.schoolClass.cohortId);
    await mine.save({
      set: [{ date: "2027-03-24", kind: "HOLIDAY", description: "Feriado" }],
      add: ["2027-03-10"],
    });

    expect(
      (await mine.client.get(`/api/classes/${other.schoolClass.id}/meetings`))
        .status,
    ).toBe(404);
    const refused = await mine.client.put(
      `/api/classes/${other.schoolClass.id}/meetings`,
      {
        planRevision: null,
        add: [],
        set: [{ date: "2027-03-24", kind: "HOLIDAY", description: "Feriado" }],
        remove: [],
        resolutions: [],
      },
    );
    expect(refused.status).toBe(404);
    expect(await other.list()).toEqual({
      items: [],
      days: [],
      total: 0,
      planRevision: null,
    });

    // The other disciplina marks the same dates its own way.
    const res = await other.save({
      add: ["2027-03-24"],
      set: [{ date: "2027-03-10", kind: "RECESS", description: "Recesso" }],
    });
    expect(res.status).toBe(200);
    expect((await mine.list()).items.map((meeting) => meeting.date)).toEqual([
      "2027-03-10",
    ]);
    expect((await mine.list()).days.map((day) => day.date)).toEqual([
      "2027-03-24",
    ]);
  });

  it("o gestor não lê nem grava o calendário da disciplina → 403", async () => {
    const { schoolClass } = await setup();
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const client = api(t, { cookie: await loginAs(t, manager) });
    expect(
      (await client.get(`/api/classes/${schoolClass.id}/meetings`)).status,
    ).toBe(403);
    const res = await client.put(`/api/classes/${schoolClass.id}/meetings`, {
      planRevision: null,
      add: [],
      set: [{ date: "2027-03-24", kind: "HOLIDAY", description: "Feriado" }],
      remove: [],
      resolutions: [],
    });
    expect(res.status).toBe(403);
  });

  it("031/US1-9 031/FR-002 um Feriado não é destino de tópico: MOVE para ele → 400; a aula que virou Feriado some do planejamento", async () => {
    const { schoolClass, subject, save, client } = await setup();
    await save({ add: ["2027-03-03", "2027-03-10", "2027-03-17"] });
    const plan = await planFor(schoolClass.id, subject.id);
    const [first, second] = await t.prisma.classMeeting.findMany({
      where: { classId: schoolClass.id },
      orderBy: { meetingDate: "asc" },
    });
    const topic = await createTopic(t, plan.id, {
      title: "Classes",
      meetingId: first!.id,
    });

    // The holiday on 24/03 is not a meeting: a MOVE to it is refused.
    await save({
      planRevision: plan.revision,
      set: [{ date: "2027-03-24", kind: "HOLIDAY", description: "Feriado" }],
    });
    const revision = (
      await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })
    ).revision;
    const moved = await save({
      planRevision: revision,
      remove: ["2027-03-03"],
      resolutions: [
        { topicId: topic.id, action: "MOVE", meetingDate: "2027-03-24" },
      ],
    });
    expect(moved.status).toBe(400);

    // The meeting turned holiday stops being offered: its id is gone, so a topic can't point at it.
    await save({
      planRevision: revision,
      set: [{ date: "2027-03-10", kind: "HOLIDAY", description: "Feriado" }],
    });
    const current = (
      await t.prisma.classPlan.findUniqueOrThrow({ where: { id: plan.id } })
    ).revision;
    const patched = await client.patch(
      `/api/classes/${schoolClass.id}/plan/topics/${topic.id}`,
      {
        planRevision: current,
        meetingId: second!.id,
      },
    );
    expect(patched.status).not.toBe(200);
    const view = ClassPlanEnvelopeSchema.parse(
      (await client.get(`/api/classes/${schoolClass.id}/plan`)).body,
    ).plan!;
    expect(view.meetings.map((meeting) => meeting.date)).toEqual([
      "2027-03-03",
      "2027-03-17",
    ]);
  });

  it("031/FR-025 com dias de todos os tipos, o planejamento lista só os encontros e a contagem é a de total", async () => {
    const { schoolClass, subject, save, list, client } = await setup();
    await planFor(schoolClass.id, subject.id);
    const revision = (
      await t.prisma.classPlan.findUniqueOrThrow({
        where: { classId: schoolClass.id },
      })
    ).revision;
    await save({
      planRevision: revision,
      set: [
        { date: "2027-03-01", kind: "CLASS" },
        { date: "2027-03-02", kind: "EXAM", description: "P1" },
        { date: "2027-03-03", kind: "ASSIGNMENT", description: "T1" },
        { date: "2027-03-04", kind: "REVIEW", description: "R" },
        { date: "2027-03-05", kind: "MAKEUP", description: "Rep" },
        { date: "2027-03-08", kind: "HOLIDAY", description: "F" },
        { date: "2027-03-09", kind: "RECESS", description: "Rec" },
        { date: "2027-03-10", kind: "SPECIAL_EVENT", description: "Ev" },
        {
          date: "2027-03-11",
          kind: "TEACHER_ABSENCE",
          absenceReason: "Consulta",
        },
      ],
    });
    const view = ClassPlanEnvelopeSchema.parse(
      (await client.get(`/api/classes/${schoolClass.id}/plan`)).body,
    ).plan!;
    expect(view.meetings.map((meeting) => meeting.kind)).toEqual([
      "CLASS",
      "EXAM",
      "ASSIGNMENT",
      "REVIEW",
      "MAKEUP",
    ]);
    expect(view.meetings).toHaveLength((await list()).total);
  });

  it("031/FR-009 a mudança de período apaga os dias sem aula fora dele (todos ao limpar as datas) e registra calendarDaysRemoved", async () => {
    const { schoolClass, save, client, list } = await setup();
    await save({
      add: ["2027-03-10"],
      set: [
        { date: "2027-02-03", kind: "HOLIDAY", description: "Antes" },
        { date: "2027-04-21", kind: "HOLIDAY", description: "Tiradentes" },
        {
          date: "2027-06-23",
          kind: "TEACHER_ABSENCE",
          absenceReason: "Consulta",
        },
        { date: "2027-06-30", kind: "RECESS", description: "Recesso" },
      ],
    });

    // Meetings outside still refuse, as 004/US4-7, and nothing is deleted.
    const refused = await client.patch(`/api/classes/${schoolClass.id}`, {
      startsOn: "2027-03-15",
      endsOn: "2027-06-30",
    });
    expect(refused.body.code).toBe("MEETINGS_OUTSIDE_PERIOD");
    expect((await list()).days).toHaveLength(4);

    const shorter = await client.patch(`/api/classes/${schoolClass.id}`, {
      startsOn: "2027-03-01",
      endsOn: "2027-06-25",
    });
    expect(shorter.status).toBe(200);
    expect((await list()).days.map((day) => day.date)).toEqual([
      "2027-04-21",
      "2027-06-23",
    ]);
    const [event] = await events("class.offering_updated");
    expect(event!.metadata).toMatchObject({ calendarDaysRemoved: 2 });

    await save({ remove: ["2027-03-10"] });
    const cleared = await client.patch(`/api/classes/${schoolClass.id}`, {
      startsOn: null,
      endsOn: null,
    });
    expect(cleared.status).toBe(200);
    expect(
      await t.prisma.classCalendarDay.count({
        where: { classId: schoolClass.id },
      }),
    ).toBe(0);
    const [, second] = await events("class.offering_updated");
    expect(second!.metadata).toMatchObject({ calendarDaysRemoved: 2 });
  });

  it("auditoria: um class_meetings.updated por gravação, só contagens; nenhum texto no metadata nem no log; set idêntico → nenhum evento", async () => {
    const { save } = await setup();
    const set = [
      { date: "2027-03-10", kind: "EXAM", description: DESCRIPTION },
      {
        date: "2027-03-17",
        kind: "TEACHER_ABSENCE",
        absenceReason: REASON,
        absenceNotice: NOTICE,
      },
    ];
    expect((await save({ set })).status).toBe(200);
    const [event] = await events("class_meetings.updated");
    expect(Object.keys(event!.metadata as object).sort()).toEqual([
      "added",
      "changed",
      "kinds",
      "removed",
      "resolutions",
      "total",
    ]);
    expect(
      Object.keys((event!.metadata as { kinds: object }).kinds),
    ).toHaveLength(9);
    for (const text of [DESCRIPTION, REASON, NOTICE]) {
      expect(JSON.stringify(event!.metadata)).not.toContain(text);
      expect(logs.text()).not.toContain(text);
    }

    // The same marks again: nothing changes, nothing is audited.
    expect((await save({ set })).status).toBe(200);
    expect(await events("class_meetings.updated")).toHaveLength(1);
  });
});
