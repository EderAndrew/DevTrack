import { describe, expect, it } from "vitest";
import { acceptsEvent, acceptsWrite, canStart, closesAt, EXAM_END_GRACE_MS, endedByActivity, endsAt, remainingMs, startDeadline } from "./exam-time";

const at = (minutes: number, seconds = 0, ms = 0) => new Date(Date.UTC(2026, 9, 12, 13, minutes, seconds, ms));
const timing = (overrides: Partial<{ closedAt: Date | null; cancelledAt: Date | null }> = {}) => ({
  publishAt: at(0),
  durationMinutes: 40,
  startWindowMinutes: 15,
  closedAt: null,
  cancelledAt: null,
  ...overrides,
});

describe("018/FR-011 tempo da prova, derivado no servidor (research T4)", () => {
  it("limite para iniciar = abertura + janela; o início vale da abertura até ele, inclusive", () => {
    expect(startDeadline(timing())).toEqual(at(15));
    expect(canStart(timing(), new Date(at(0).getTime() - 1))).toBe(false);
    expect(canStart(timing(), at(0))).toBe(true);
    expect(canStart(timing(), at(15))).toBe(true);
    expect(canStart(timing(), at(15, 0, 1))).toBe(false);
    expect(canStart({ ...timing(), startWindowMinutes: 0 }, at(0))).toBe(true);
  });

  it("o fim é o início de cada aluno mais a duração inteira, também para quem começa atrasado", () => {
    expect(endsAt(timing(), at(1))).toEqual(at(41));
    expect(endsAt(timing(), at(15))).toEqual(at(55));
    expect(endedByActivity(timing(), at(15))).toBe(false);
  });

  it("o encerramento ou o cancelamento da atividade antecipa o fim; depois do fim, não muda nada", () => {
    expect(endsAt(timing({ closedAt: at(30) }), at(15))).toEqual(at(30));
    expect(endsAt(timing({ cancelledAt: at(20) }), at(15))).toEqual(at(20));
    expect(endsAt(timing({ closedAt: at(59) }), at(15))).toEqual(at(55));
    expect(endedByActivity(timing({ closedAt: at(30) }), at(15))).toBe(true);
    expect(endedByActivity(timing({ closedAt: at(59) }), at(15))).toBe(false);
  });

  it("o professor vê o fechamento: limite para iniciar + duração", () => {
    expect(closesAt(timing())).toEqual(at(55));
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
