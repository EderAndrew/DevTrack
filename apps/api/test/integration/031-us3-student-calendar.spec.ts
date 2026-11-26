import { StudentCalendarSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../helpers/clock";
import {
  createClass,
  createEnrollment,
  createSubject,
  createUser,
  loginAs,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

// 031 US3 (spec.md), contracts/http-api.md "GET /me/classes/:classId/calendar", research CK6 and CK7.
const PERIOD = { startsOn: "2026-08-03", endsOn: "2026-12-11" };

describe("031/US3 — o calendário da matéria do aluno (API)", () => {
  // 02:30 UTC on the 17th is still the 16th in America/Sao_Paulo: `today` is the planning day, not UTC's.
  const clock = new FixedClock("2026-11-17T02:30:00.000Z");
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  async function scene(
    overrides: { subject?: boolean; period?: boolean } = {},
  ) {
    const teacher = await createUser(t, {
      roles: ["TEACHER"],
      name: "Ricardo Mendes",
    });
    const subject =
      overrides.subject === false
        ? null
        : await createSubject(t, teacher.id, {
            name: "Programação Orientada a Objetos",
          });
    const schoolClass = await createClass(t, teacher.id, {
      subjectId: subject?.id,
      name: "ADS 3A",
      ...(overrides.period === false ? {} : PERIOD),
    });
    const student = await createUser(t);
    await createEnrollment(t, schoolClass.id, student.id);
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const studentClient = api(t, { cookie: await loginAs(t, student) });
    const read = async () => {
      const res = await studentClient.get(
        `/api/me/classes/${schoolClass.id}/calendar`,
      );
      expect(res.status).toBe(200);
      return StudentCalendarSchema.parse(res.body);
    };
    const save = (body: object) =>
      teacherClient.put(`/api/classes/${schoolClass.id}/meetings`, {
        planRevision: null,
        add: [],
        remove: [],
        resolutions: [],
        ...body,
      });
    return { teacher, schoolClass, student, read, save };
  }

  it("031/US3-4 031/US3-5 031/US3-6 a matéria, o professor, o período, today do servidor e os dias em ordem com o texto do aluno", async () => {
    const { schoolClass, read, save } = await scene();
    expect(
      (
        await save({
          add: ["2026-11-16"],
          set: [
            {
              date: "2026-11-20",
              kind: "HOLIDAY",
              description: "Consciência Negra",
            },
            {
              date: "2026-11-18",
              kind: "TEACHER_ABSENCE",
              absenceReason: "Consulta médica",
              absenceNotice: "Atividade no portal.",
            },
            {
              date: "2026-11-25",
              kind: "TEACHER_ABSENCE",
              absenceReason: "Congresso",
            },
            { date: "2026-11-23", kind: "EXAM", description: "P1 — Herança" },
          ],
        })
      ).status,
    ).toBe(200);

    expect(await read()).toEqual({
      class: {
        id: schoolClass.id,
        subjectName: "Programação Orientada a Objetos",
        teacherName: "Ricardo Mendes",
        startsOn: "2026-08-03",
        endsOn: "2026-12-11",
      },
      today: "2026-11-16",
      days: [
        { date: "2026-11-16", kind: "CLASS", text: null },
        {
          date: "2026-11-18",
          kind: "TEACHER_ABSENCE",
          text: "Atividade no portal.",
        },
        { date: "2026-11-20", kind: "HOLIDAY", text: "Consciência Negra" },
        { date: "2026-11-23", kind: "EXAM", text: "P1 — Herança" },
        { date: "2026-11-25", kind: "TEACHER_ABSENCE", text: null },
      ],
    });
  });

  it("031/US3-10 disciplina sem marcações → days: []", async () => {
    const { read } = await scene();
    expect((await read()).days).toEqual([]);
  });

  it("disciplina sem período → startsOn/endsOn null e days: []", async () => {
    const { read } = await scene({ period: false });
    const calendar = await read();
    expect(calendar.class).toMatchObject({ startsOn: null, endsOn: null });
    expect(calendar.days).toEqual([]);
  });

  it("disciplina migrada sem matéria → subjectName é o nome da turma", async () => {
    const { read } = await scene({ subject: false });
    expect((await read()).class.subjectName).toBe("ADS 3A");
  });

  it("031/US3-11 uma gravação do professor aparece na próxima leitura", async () => {
    const { read, save } = await scene();
    expect((await read()).days).toEqual([]);
    await save({
      set: [
        {
          date: "2026-11-27",
          kind: "SPECIAL_EVENT",
          description: "Semana acadêmica",
        },
      ],
    });
    expect((await read()).days).toEqual([
      { date: "2026-11-27", kind: "SPECIAL_EVENT", text: "Semana acadêmica" },
    ]);
    await save({ remove: ["2026-11-27"] });
    expect((await read()).days).toEqual([]);
  });

  it("031/FR-021 outra turma, matrícula encerrada ou disciplina inexistente → o mesmo 404; id mal formado → 400", async () => {
    const { schoolClass, student } = await scene();
    const other = await createClass(
      t,
      (await createUser(t, { roles: ["TEACHER"] })).id,
      PERIOD,
    );
    const client = api(t, { cookie: await loginAs(t, student) });

    const outside = await client.get(`/api/me/classes/${other.id}/calendar`);
    const unknown = await client.get(
      `/api/me/classes/00000000-0000-4000-8000-000000000999/calendar`,
    );
    expect(outside.status).toBe(404);
    expect(unknown.body).toEqual(outside.body);

    await t.prisma.enrollment.updateMany({
      where: { studentUserId: student.id },
      data: { status: "REMOVED", removedAt: new Date() },
    });
    const ended = await client.get(
      `/api/me/classes/${schoolClass.id}/calendar`,
    );
    expect(ended.status).toBe(404);
    expect(ended.body).toEqual(outside.body);

    const malformed = await client.get(`/api/me/classes/nao-e-um-id/calendar`);
    expect(malformed.status).toBe(400);
  });
});
