import type { StudentCalendarDay } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  canGoNext,
  canGoPrevious,
  clampWeek,
  dayButtonName,
  dayDetail,
  initialSelection,
  longDay,
  monthLabel,
  weekDays,
  weekdayShort,
  weekLabel,
  weekStart,
} from "./week";

// 031 contracts/ui.md "Student", research CK8.
const PERIOD = { startsOn: "2026-08-03", endsOn: "2026-12-11" };
const day = (
  date: string,
  kind: StudentCalendarDay["kind"],
  text: string | null = null,
): StudentCalendarDay => ({
  date,
  kind,
  text,
});

describe("031 week: a faixa semanal do aluno", () => {
  it("weekStart é a segunda-feira; weekDays vai de segunda a domingo", () => {
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(weekStart("2026-11-19")).toBe("2026-11-16");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(weekDays("2026-11-16")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
    expect(weekDays("2026-11-16").map(weekdayShort)).toEqual([
      "SEG",
      "TER",
      "QUA",
      "QUI",
      "SEX",
      "SÁB",
      "DOM",
    ]);
  });

  it("weekLabel e monthLabel (da segunda-feira)", () => {
    expect(weekLabel("2026-11-16")).toBe("16–22 nov");
    expect(weekLabel("2026-10-26")).toBe("26 out–1 nov");
    expect(weekLabel("2026-12-28")).toBe("28 dez–3 jan");
    expect(monthLabel("2026-11-16")).toBe("Novembro 2026");
    expect(monthLabel("2026-10-26")).toBe("Outubro 2026");
    expect(longDay("2026-11-16")).toBe("Segunda-feira, 16 de novembro");
  });

  it("clampWeek e as setas ficam entre a semana do primeiro e a do último dia do período", () => {
    expect(clampWeek("2026-07-20", PERIOD)).toBe("2026-08-03");
    expect(clampWeek("2026-12-21", PERIOD)).toBe("2026-12-07");
    expect(clampWeek("2026-11-16", PERIOD)).toBe("2026-11-16");
    expect(canGoPrevious("2026-08-03", PERIOD)).toBe(false);
    expect(canGoPrevious("2026-08-10", PERIOD)).toBe(true);
    expect(canGoNext("2026-12-07", PERIOD)).toBe(false);
    expect(canGoNext("2026-11-30", PERIOD)).toBe(true);
  });

  it("initialSelection: hoje no período → semana de hoje com hoje; antes → primeira semana; depois → última; sem período → nada", () => {
    const days = [
      day("2026-08-05", "CLASS"),
      day("2026-12-09", "EXAM", "P2"),
      day("2026-12-10", "CLASS"),
    ];
    expect(initialSelection("2026-11-18", PERIOD, days)).toEqual({
      week: "2026-11-16",
      selected: "2026-11-18",
    });
    expect(initialSelection("2026-07-01", PERIOD, days)).toEqual({
      week: "2026-08-03",
      selected: "2026-08-05",
    });
    expect(initialSelection("2027-01-10", PERIOD, days)).toEqual({
      week: "2026-12-07",
      selected: "2026-12-09",
    });
    expect(initialSelection("2027-01-10", PERIOD, [])).toEqual({
      week: "2026-12-07",
      selected: null,
    });
    expect(initialSelection("2026-11-18", null, days)).toBeNull();
  });

  it('dayDetail por tipo: Aula só "Aula"; descritos com o texto; Falta com o aviso ou sem; não marcado → null', () => {
    expect(dayDetail(day("2026-11-16", "CLASS"))).toEqual({
      label: "Aula",
      text: null,
    });
    expect(
      dayDetail(day("2026-11-20", "HOLIDAY", "Consciência Negra")),
    ).toEqual({ label: "Feriado", text: "Consciência Negra" });
    expect(dayDetail(day("2026-11-23", "EXAM", "P1"))).toEqual({
      label: "Prova",
      text: "P1",
    });
    expect(
      dayDetail(day("2026-11-18", "TEACHER_ABSENCE", "Atividade no portal.")),
    ).toEqual({
      label: "Falta do professor",
      text: "Atividade no portal.",
    });
    expect(dayDetail(day("2026-11-25", "TEACHER_ABSENCE"))).toEqual({
      label: "Falta do professor",
      text: null,
    });
    expect(dayDetail(undefined)).toBeNull();
  });

  it('o nome acessível de cada dia tem a data, o tipo e "hoje"', () => {
    expect(
      dayButtonName("2026-11-16", day("2026-11-16", "CLASS"), "2026-11-16"),
    ).toBe("Segunda-feira, 16 de novembro, hoje: Aula");
    expect(dayButtonName("2026-11-17", undefined, "2026-11-16")).toBe(
      "Terça-feira, 17 de novembro: sem marcação",
    );
  });
});
