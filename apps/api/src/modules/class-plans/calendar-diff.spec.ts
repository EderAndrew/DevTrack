import { describe, expect, it } from "vitest";
import {
  type CalendarChanges,
  type SavedCalendar,
  type SavedDay,
  type SavedMeeting,
  diffCalendar,
  meetingTotalAfter,
} from "./calendar-diff";

// 031 research CK3 and data-model.md "Transitions of a date".
const meeting = (
  id: string,
  kind: SavedMeeting["kind"] = "CLASS",
  description: string | null = null,
): SavedMeeting => ({
  id,
  kind,
  description,
});
const day = (
  kind: SavedDay["kind"],
  fields: Partial<SavedDay> = {},
): SavedDay => ({
  kind,
  description: kind === "TEACHER_ABSENCE" ? null : "Descrição",
  absenceReason: kind === "TEACHER_ABSENCE" ? "Consulta" : null,
  absenceNotice: null,
  ...fields,
});

const saved = (
  meetings: [string, SavedMeeting][] = [],
  days: [string, SavedDay][] = [],
): SavedCalendar => ({
  meetings: new Map(meetings),
  days: new Map(days),
});

const changes = (fields: Partial<CalendarChanges>): CalendarChanges => ({
  add: [],
  set: [],
  remove: [],
  ...fields,
});

function diffOf(calendar: SavedCalendar, fields: Partial<CalendarChanges>) {
  const result = diffCalendar(calendar, changes(fields));
  if (!result.ok) throw new Error(result.reason);
  return result.diff;
}

const EMPTY = {
  createMeetings: [],
  updateMeetings: [],
  createDays: [],
  updateDays: [],
  deleteDays: [],
  leavingMeetingIds: [],
  added: 0,
  removed: 0,
  changed: 0,
};

describe("031 calendar-diff: as transições de uma data numa gravação", () => {
  it("não marcado → add ou set de tipo de encontro cria o encontro", () => {
    expect(
      diffOf(saved(), {
        add: ["2026-11-16"],
        set: [{ date: "2026-11-17", kind: "EXAM", description: "P1" }],
      }),
    ).toEqual({
      ...EMPTY,
      createMeetings: [
        { date: "2026-11-16", kind: "CLASS", description: null },
        { date: "2026-11-17", kind: "EXAM", description: "P1" },
      ],
      added: 2,
    });
  });

  it("não marcado → set de tipo que não é encontro cria o dia", () => {
    expect(
      diffOf(saved(), {
        set: [
          {
            date: "2026-11-20",
            kind: "HOLIDAY",
            description: "Consciência Negra",
          },
          {
            date: "2026-11-25",
            kind: "TEACHER_ABSENCE",
            absenceReason: "Consulta",
            absenceNotice: "Aviso",
          },
        ],
      }),
    ).toEqual({
      ...EMPTY,
      createDays: [
        {
          date: "2026-11-20",
          kind: "HOLIDAY",
          description: "Consciência Negra",
          absenceReason: null,
          absenceNotice: null,
        },
        {
          date: "2026-11-25",
          kind: "TEACHER_ABSENCE",
          description: null,
          absenceReason: "Consulta",
          absenceNotice: "Aviso",
        },
      ],
      added: 2,
    });
  });

  it("encontro → outro tipo de encontro atualiza o mesmo encontro (tópicos ficam)", () => {
    expect(
      diffOf(saved([["2026-11-16", meeting("m1")]]), {
        set: [
          { date: "2026-11-16", kind: "REVIEW", description: "Revisão P1" },
        ],
      }),
    ).toEqual({
      ...EMPTY,
      updateMeetings: [
        {
          id: "m1",
          date: "2026-11-16",
          kind: "REVIEW",
          description: "Revisão P1",
        },
      ],
      changed: 1,
    });
  });

  it("031/FR-006 mudar Prova → Aula descarta a descrição", () => {
    const diff = diffOf(saved([["2026-11-16", meeting("m1", "EXAM", "P1")]]), {
      set: [{ date: "2026-11-16", kind: "CLASS" }],
    });
    expect(diff.updateMeetings).toEqual([
      { id: "m1", date: "2026-11-16", kind: "CLASS", description: null },
    ]);
  });

  it("encontro → tipo que não é encontro: o encontro sai (resoluções) e o dia é criado", () => {
    expect(
      diffOf(saved([["2026-11-18", meeting("m1")]]), {
        set: [
          {
            date: "2026-11-18",
            kind: "TEACHER_ABSENCE",
            absenceReason: "Consulta",
            absenceNotice: null,
          },
        ],
      }),
    ).toEqual({
      ...EMPTY,
      createDays: [
        {
          date: "2026-11-18",
          kind: "TEACHER_ABSENCE",
          description: null,
          absenceReason: "Consulta",
          absenceNotice: null,
        },
      ],
      leavingMeetingIds: ["m1"],
      changed: 1,
    });
  });

  it("encontro → remove: o encontro sai", () => {
    expect(
      diffOf(saved([["2026-11-16", meeting("m1")]]), {
        remove: ["2026-11-16"],
      }),
    ).toEqual({
      ...EMPTY,
      leavingMeetingIds: ["m1"],
      removed: 1,
    });
  });

  it("dia → tipo de encontro: o dia é apagado e o encontro criado", () => {
    expect(
      diffOf(saved([], [["2026-11-20", day("HOLIDAY")]]), {
        set: [{ date: "2026-11-20", kind: "MAKEUP", description: "Aula 3" }],
      }),
    ).toEqual({
      ...EMPTY,
      createMeetings: [
        { date: "2026-11-20", kind: "MAKEUP", description: "Aula 3" },
      ],
      deleteDays: ["2026-11-20"],
      changed: 1,
    });
  });

  it("031/FR-006 dia → outro tipo de dia: Falta → Feriado limpa motivo e aviso", () => {
    const calendar = saved(
      [],
      [["2026-11-18", day("TEACHER_ABSENCE", { absenceNotice: "Aviso" })]],
    );
    expect(
      diffOf(calendar, {
        set: [{ date: "2026-11-18", kind: "HOLIDAY", description: "Feriado" }],
      }),
    ).toEqual({
      ...EMPTY,
      updateDays: [
        {
          date: "2026-11-18",
          kind: "HOLIDAY",
          description: "Feriado",
          absenceReason: null,
          absenceNotice: null,
        },
      ],
      changed: 1,
    });
  });

  it("dia → remove: o dia é apagado", () => {
    expect(
      diffOf(saved([], [["2026-11-20", day("RECESS")]]), {
        remove: ["2026-11-20"],
      }),
    ).toEqual({
      ...EMPTY,
      deleteDays: ["2026-11-20"],
      removed: 1,
    });
  });

  it("add de encontro existente, remove de data não marcada e set idêntico não mudam nada (changed = 0)", () => {
    const calendar = saved(
      [
        ["2026-11-16", meeting("m1")],
        ["2026-11-17", meeting("m2", "EXAM", "P1")],
      ],
      [
        ["2026-11-20", day("HOLIDAY", { description: "Consciência Negra" })],
        ["2026-11-18", day("TEACHER_ABSENCE", { absenceNotice: "Aviso" })],
      ],
    );
    expect(
      diffOf(calendar, {
        add: ["2026-11-16", "2026-11-16"],
        set: [
          { date: "2026-11-17", kind: "EXAM", description: "P1" },
          {
            date: "2026-11-20",
            kind: "HOLIDAY",
            description: "Consciência Negra",
          },
          {
            date: "2026-11-18",
            kind: "TEACHER_ABSENCE",
            absenceReason: "Consulta",
            absenceNotice: "Aviso",
          },
        ],
        remove: ["2026-11-30"],
      }),
    ).toEqual(EMPTY);
  });

  it("mudar só o texto conta em changed", () => {
    const calendar = saved([], [["2026-11-18", day("TEACHER_ABSENCE")]]);
    const diff = diffOf(calendar, {
      set: [
        {
          date: "2026-11-18",
          kind: "TEACHER_ABSENCE",
          absenceReason: "Consulta",
          absenceNotice: "Novo aviso",
        },
      ],
    });
    expect(diff.updateDays).toHaveLength(1);
    expect(diff.changed).toBe(1);
  });

  it("data repetida entre add, set e remove (ou duas vezes em set) → erro de validação", () => {
    const calendar = saved();
    const set = [{ date: "2026-11-16", kind: "CLASS" as const }];
    expect(
      diffCalendar(calendar, changes({ add: ["2026-11-16"], set })),
    ).toEqual({ ok: false, reason: "DUPLICATE_DATE" });
    expect(
      diffCalendar(calendar, changes({ remove: ["2026-11-16"], set })),
    ).toEqual({ ok: false, reason: "DUPLICATE_DATE" });
    expect(
      diffCalendar(
        calendar,
        changes({ add: ["2026-11-16"], remove: ["2026-11-16"] }),
      ),
    ).toEqual({
      ok: false,
      reason: "DUPLICATE_DATE",
    });
    expect(diffCalendar(calendar, changes({ set: [...set, ...set] }))).toEqual({
      ok: false,
      reason: "DUPLICATE_DATE",
    });
  });

  it("add de um dia que não é encontro → erro (use set)", () => {
    expect(
      diffCalendar(
        saved([], [["2026-11-20", day("HOLIDAY")]]),
        changes({ add: ["2026-11-20"] }),
      ),
    ).toEqual({
      ok: false,
      reason: "ADD_ON_DAY",
    });
  });

  it("o total de encontros depois da gravação conta só os encontros", () => {
    const calendar = saved(
      [
        ["2026-11-16", meeting("m1")],
        ["2026-11-18", meeting("m2")],
      ],
      [["2026-11-20", day("HOLIDAY")]],
    );
    const diff = diffOf(calendar, {
      add: ["2026-11-23"],
      set: [
        { date: "2026-11-18", kind: "SPECIAL_EVENT", description: "Palestra" },
        { date: "2026-11-20", kind: "CLASS" },
      ],
    });
    expect(meetingTotalAfter(calendar, diff)).toBe(3);
  });
});
