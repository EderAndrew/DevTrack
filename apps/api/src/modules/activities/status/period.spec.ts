import { describe, expect, it } from "vitest";
import { acceptsAttendanceMark, canChangeEnd, validPeriod } from "./period";

const at = (minutes: number) => new Date(Date.UTC(2026, 10, 30, 22, minutes));

describe("032 período da atividade (research AP5, AP6)", () => {
  it("032/FR-002 o término vem depois do início; na prova, deixa ao menos a duração", () => {
    expect(validPeriod({ type: "ASSIGNMENT", publishAt: at(0), deadline: at(1), durationMinutes: null })).toBe(true);
    expect(validPeriod({ type: "ASSIGNMENT", publishAt: at(0), deadline: at(0), durationMinutes: null })).toBe(false);
    expect(validPeriod({ type: "ASSIGNMENT", publishAt: at(10), deadline: at(0), durationMinutes: null })).toBe(false);
    expect(validPeriod({ type: "EXAM", publishAt: at(0), deadline: at(60), durationMinutes: 60 })).toBe(true);
    expect(validPeriod({ type: "EXAM", publishAt: at(0), deadline: at(59), durationMinutes: 60 })).toBe(false);
    expect(validPeriod({ type: "EXAM", publishAt: at(0), deadline: at(0), durationMinutes: 1 })).toBe(false);
  });

  it("032/FR-012 trabalho: o término muda livre enquanto ativo", () => {
    const work = { type: "ASSIGNMENT" as const, currentEnd: at(60) };
    expect(canChangeEnd({ ...work, phase: "PUBLISHED", newEnd: at(30), now: at(10) })).toBe("ok");
    expect(canChangeEnd({ ...work, phase: "PUBLISHED", newEnd: at(90), now: at(70) })).toBe("ok");
    expect(canChangeEnd({ ...work, phase: "SCHEDULED", newEnd: at(30), now: at(-10) })).toBe("ok");
  });

  it("032/FR-012 prova agendada: o término muda livre; publicada: só estende, e nunca depois do fim", () => {
    const exam = { type: "EXAM" as const, currentEnd: at(60) };
    expect(canChangeEnd({ ...exam, phase: "SCHEDULED", newEnd: at(30), now: at(-10) })).toBe("ok");
    expect(canChangeEnd({ ...exam, phase: "PUBLISHED", newEnd: at(90), now: at(10) })).toBe("ok");
    expect(canChangeEnd({ ...exam, phase: "PUBLISHED", newEnd: at(60), now: at(10) })).toBe("ok");
    expect(canChangeEnd({ ...exam, phase: "PUBLISHED", newEnd: at(59), now: at(10) })).toBe("EXAM_END_CANNOT_MOVE_EARLIER");
    expect(canChangeEnd({ ...exam, phase: "PUBLISHED", newEnd: at(90), now: at(60) })).toBe("ok");
    expect(canChangeEnd({ ...exam, phase: "PUBLISHED", newEnd: at(90), now: new Date(at(60).getTime() + 1) })).toBe("ACTIVITY_PERIOD_ENDED");
  });

  it("032/FR-014 a presença é aceita até o término, inclusive; depois, só no trabalho legado que aceita atrasado", () => {
    const deadline = at(60);
    expect(acceptsAttendanceMark({ type: "EXAM", latePolicy: null, deadline, now: at(30) })).toBe(true);
    expect(acceptsAttendanceMark({ type: "EXAM", latePolicy: null, deadline, now: at(60) })).toBe(true);
    expect(acceptsAttendanceMark({ type: "EXAM", latePolicy: null, deadline, now: at(61) })).toBe(false);
    expect(acceptsAttendanceMark({ type: "ASSIGNMENT", latePolicy: "REJECT", deadline, now: at(61) })).toBe(false);
    expect(acceptsAttendanceMark({ type: "ASSIGNMENT", latePolicy: "ACCEPT_MARKED", deadline, now: at(61) })).toBe(true);
  });

  it("032/SC-006 o exercício não tem período: a presença não depende de término", () => {
    expect(acceptsAttendanceMark({ type: "EXERCISE", latePolicy: null, deadline: null, now: at(61) })).toBe(true);
  });
});
