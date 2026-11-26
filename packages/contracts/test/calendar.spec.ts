import { describe, expect, it } from "vitest";
import {
  CalendarDayInputSchema,
  ClassMeetingListSchema,
  ClassMeetingViewSchema,
  DayKindSchema,
  StudentCalendarSchema,
  UpdateClassMeetingsRequestSchema,
} from "../src/index.js";

// 031 contracts/http-api.md: the kinds, the typed `set` of the teacher's save and the student's calendar.
const ID = "00000000-0000-4000-8000-000000000001";

describe("031 contratos do calendário com tipos de dia", () => {
  it("DayKindSchema tem os nove tipos", () => {
    expect(DayKindSchema.options).toEqual([
      "CLASS",
      "EXAM",
      "ASSIGNMENT",
      "REVIEW",
      "MAKEUP",
      "HOLIDAY",
      "RECESS",
      "SPECIAL_EVENT",
      "TEACHER_ABSENCE",
    ]);
  });

  it("Aula só tem a data", () => {
    expect(
      CalendarDayInputSchema.safeParse({ date: "2026-11-16", kind: "CLASS" })
        .success,
    ).toBe(true);
    expect(
      CalendarDayInputSchema.safeParse({
        date: "2026-11-16",
        kind: "CLASS",
        description: "Aula",
      }).success,
    ).toBe(false);
  });

  it("os sete tipos descritos exigem descrição de 1–120 code points após o trim, sem NUL", () => {
    for (const kind of [
      "EXAM",
      "ASSIGNMENT",
      "REVIEW",
      "MAKEUP",
      "HOLIDAY",
      "RECESS",
      "SPECIAL_EVENT",
    ]) {
      const parse = (description?: string) =>
        CalendarDayInputSchema.safeParse({
          date: "2026-11-16",
          kind,
          description,
        });
      expect(parse().success, kind).toBe(false);
      expect(parse("   ").success, kind).toBe(false);
      expect(parse("a\u0000b").success, kind).toBe(false);
      expect(parse("😀".repeat(121)).success, kind).toBe(false);
      const ok = parse(`  ${"😀".repeat(120)}  `);
      expect(ok.success, kind).toBe(true);
      expect(ok.data).toEqual({
        date: "2026-11-16",
        kind,
        description: "😀".repeat(120),
      });
      expect(
        CalendarDayInputSchema.safeParse({
          date: "2026-11-16",
          kind,
          description: "P1",
          absenceReason: "x",
        }).success,
        kind,
      ).toBe(false);
    }
  });

  it("a Falta exige motivo de 1–500, aceita aviso até 200 (vazio vira null) e recusa descrição", () => {
    const parse = (fields: Record<string, unknown>) =>
      CalendarDayInputSchema.safeParse({
        date: "2026-11-18",
        kind: "TEACHER_ABSENCE",
        ...fields,
      });
    /** The notice of a parsed Falta (only that variant of the union has it). */
    const notice = (fields: Record<string, unknown>) => {
      const data = parse(fields).data;
      return data?.kind === "TEACHER_ABSENCE" ? data.absenceNotice : undefined;
    };
    expect(parse({}).success).toBe(false);
    expect(parse({ absenceReason: "  " }).success).toBe(false);
    expect(parse({ absenceReason: "x".repeat(501) }).success).toBe(false);
    expect(
      parse({ absenceReason: "Consulta", absenceNotice: "x".repeat(201) })
        .success,
    ).toBe(false);
    expect(
      parse({ absenceReason: "Consulta", absenceNotice: "a\u0000" }).success,
    ).toBe(false);
    expect(
      parse({ absenceReason: "Consulta", description: "Falta" }).success,
    ).toBe(false);

    expect(
      parse({ absenceReason: "x".repeat(500), absenceNotice: "x".repeat(200) })
        .success,
    ).toBe(true);
    expect(parse({ absenceReason: " Consulta médica " }).data).toEqual({
      date: "2026-11-18",
      kind: "TEACHER_ABSENCE",
      absenceReason: "Consulta médica",
      absenceNotice: null,
    });
    expect(
      notice({ absenceReason: "Consulta", absenceNotice: "   " }),
    ).toBeNull();
    expect(
      notice({ absenceReason: "Consulta", absenceNotice: "" }),
    ).toBeNull();
    expect(
      notice({ absenceReason: "Consulta", absenceNotice: null }),
    ).toBeNull();
    expect(
      notice({ absenceReason: "Consulta", absenceNotice: " Atividade " }),
    ).toBe("Atividade");
  });

  it("o corpo da 004 sem set continua válido; campo desconhecido é recusado", () => {
    const body = {
      planRevision: 3,
      add: ["2026-11-16"],
      remove: [],
      resolutions: [],
    };
    expect(UpdateClassMeetingsRequestSchema.parse(body)).toEqual({
      ...body,
      set: [],
    });
    expect(
      UpdateClassMeetingsRequestSchema.safeParse({ ...body, kinds: [] })
        .success,
    ).toBe(false);
    expect(
      UpdateClassMeetingsRequestSchema.safeParse({
        ...body,
        set: Array.from({ length: 401 }, () => ({
          date: "2026-11-16",
          kind: "CLASS",
        })),
      }).success,
    ).toBe(false);
  });

  it("a lista do professor exige kind e description em cada encontro e os dias sem aula", () => {
    const meeting = {
      id: ID,
      date: "2026-11-16",
      number: 1,
      status: "PLANNED",
      topicCount: 0,
    };
    expect(ClassMeetingViewSchema.safeParse(meeting).success).toBe(false);
    expect(
      ClassMeetingViewSchema.safeParse({
        ...meeting,
        kind: "CLASS",
        description: null,
      }).success,
    ).toBe(true);
    expect(
      ClassMeetingViewSchema.safeParse({
        ...meeting,
        kind: "HOLIDAY",
        description: "x",
      }).success,
    ).toBe(false);

    const list = { items: [], total: 0, planRevision: null };
    expect(ClassMeetingListSchema.safeParse(list).success).toBe(false);
    expect(
      ClassMeetingListSchema.safeParse({
        ...list,
        days: [
          {
            date: "2026-11-18",
            kind: "TEACHER_ABSENCE",
            description: null,
            absenceReason: "Consulta médica",
            absenceNotice: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("031/SC-004 o calendário do aluno é estrito: sem tópicos, número, situação, motivo ou id num dia", () => {
    const calendar = {
      class: {
        id: ID,
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
      ],
    };
    expect(StudentCalendarSchema.safeParse(calendar).success).toBe(true);
    expect(
      StudentCalendarSchema.safeParse({
        ...calendar,
        class: { ...calendar.class, startsOn: null, endsOn: null },
        days: [],
      }).success,
    ).toBe(true);
    for (const extra of [
      { topics: [] },
      { number: 1 },
      { status: "PLANNED" },
      { absenceReason: "x" },
      { id: ID },
    ]) {
      const days = [{ ...calendar.days[0], ...extra }];
      expect(
        StudentCalendarSchema.safeParse({ ...calendar, days }).success,
        Object.keys(extra)[0],
      ).toBe(false);
    }
    expect(
      StudentCalendarSchema.safeParse({ ...calendar, topics: [] }).success,
    ).toBe(false);
  });
});
