import { describe, expect, it } from "vitest";
import { formatDayMonth, formatWeekdayTime } from "./dates";

/** 028 research HI9: the dates of a row of the "Histórico", in the browser's time zone like `formatLongDateTime`. */

// Built from local time, so the expected text is the same in any time zone the tests run in.
const FRIDAY = new Date(2026, 10, 13, 16, 47).toISOString();

describe("028/FR-009 datas da linha do Histórico", () => {
  it("formatDayMonth dá o dia e o mês por extenso", () => {
    expect(formatDayMonth(FRIDAY)).toBe("13 de novembro");
  });

  it("formatWeekdayTime dá o dia da semana com inicial maiúscula e a hora", () => {
    expect(formatWeekdayTime(FRIDAY)).toBe("Sexta-feira, 16:47");
  });
});
