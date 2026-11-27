import { describe, expect, it } from "vitest";
import { acceptsEvent, acceptsWrite, canStart, closesAt, EXAM_END_GRACE_MS, endedByActivity, endsAt, remainingMs, startDeadline } from "./exam-time";

const at = (minutes: number, seconds = 0, ms = 0) => new Date(Date.UTC(2026, 9, 12, 13, minutes, seconds, ms));
/** A 40-minute exam in the period 13:00 → 14:30 (032: the end of the period replaces the start window). */
const timing = (overrides: Partial<{ deadline: Date; closedAt: Date | null; cancelledAt: Date | null }> = {}) => ({
  publishAt: at(0),
  durationMinutes: 40,
  deadline: at(90),
  closedAt: null,
  cancelledAt: null,
  ...overrides,
});

describe("018/FR-011 tempo da prova, derivado no servidor (research T4; 032 AP3)", () => {
  it("032/FR-006 o início vale do começo ao fim do período, inclusive; o limite para iniciar é o término", () => {
    expect(startDeadline(timing())).toEqual(at(90));
    expect(canStart(timing(), new Date(at(0).getTime() - 1))).toBe(false);
    expect(canStart(timing(), at(0))).toBe(true);
    expect(canStart(timing(), at(75))).toBe(true);
    expect(canStart(timing(), at(90))).toBe(true);
    expect(canStart(timing(), at(90, 0, 1))).toBe(false);
  });

  it("032/FR-007 o fim é o início + a duração, cortado pelo fim do período; o corte do período é tempo esgotado", () => {
    expect(endsAt(timing(), at(1))).toEqual(at(41));
    expect(endsAt(timing(), at(50))).toEqual(at(90));
    expect(endsAt(timing(), at(80))).toEqual(at(90));
    expect(endedByActivity(timing(), at(50))).toBe(false);
    expect(endedByActivity(timing(), at(80))).toBe(false);
  });

  it("018/FR-011 o encerramento ou o cancelamento da atividade antecipa o fim (ACTIVITY_CLOSED); depois do fim, não muda nada", () => {
    expect(endsAt(timing({ closedAt: at(30) }), at(15))).toEqual(at(30));
    expect(endsAt(timing({ cancelledAt: at(20) }), at(15))).toEqual(at(20));
    expect(endsAt(timing({ closedAt: at(59) }), at(15))).toEqual(at(55));
    expect(endedByActivity(timing({ closedAt: at(30) }), at(15))).toBe(true);
    expect(endedByActivity(timing({ closedAt: at(59) }), at(15))).toBe(false);
    expect(endsAt(timing({ closedAt: at(85) }), at(80))).toEqual(at(85));
    expect(endedByActivity(timing({ closedAt: at(85) }), at(80))).toBe(true);
    expect(endedByActivity(timing({ closedAt: at(95) }), at(80))).toBe(false);
  });

  it("032/FR-008 o professor vê o fechamento: o fim do período", () => {
    expect(closesAt(timing())).toEqual(at(90));
  });

  it("032/FR-012 estender o término devolve o tempo só a quem estava cortado, até a duração", () => {
    const extended = timing({ deadline: at(110) });
    expect(endsAt(extended, at(1))).toEqual(at(41));
    expect(endsAt(extended, at(60))).toEqual(at(100));
    expect(endsAt(extended, at(80))).toEqual(at(110));
  });

  it("018/FR-012 o tempo restante nunca é negativo", () => {
    expect(remainingMs(at(41), at(40, 30))).toBe(30_000);
    expect(remainingMs(at(41), at(42))).toBe(0);
  });

  it("018/FR-013 salvar e entregar até o fim mais 2 s de tolerância; eventos só até o fim", () => {
    expect(EXAM_END_GRACE_MS).toBe(2000);
    const end = at(41);
    expect(acceptsWrite(at(40, 59, 999), end)).toBe(true);
    expect(acceptsWrite(at(41, 1, 999), end)).toBe(true);
    expect(acceptsWrite(at(41, 2), end)).toBe(false);
    expect(acceptsEvent(at(40, 59, 999), end)).toBe(true);
    expect(acceptsEvent(at(41), end)).toBe(false);
  });
});
