import { describe, expect, it } from "vitest";
import { DAY, FixedClock, MINUTE } from "../../../test/helpers/clock";
import { systemClock } from "./clock";

describe("012/FR-024a relógio do servidor (research P10)", () => {
  it("o relógio do sistema devolve a hora atual, uma Date nova a cada leitura", () => {
    const before = Date.now();
    const now = systemClock.now();
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(Date.now());
    expect(systemClock.now()).not.toBe(now);
  });

  it("o relógio fixo dos testes é ajustado e avançado sem esperar, e quem o lê não o altera", () => {
    const clock = new FixedClock("2026-10-10T23:59:00.000Z");
    const read = clock.now();
    read.setUTCFullYear(2000);
    expect(clock.now().toISOString()).toBe("2026-10-10T23:59:00.000Z");
    clock.advance(MINUTE);
    expect(clock.now().toISOString()).toBe("2026-10-11T00:00:00.000Z");
    clock.set("2026-10-01T00:00:00.000Z");
    clock.advance(DAY);
    expect(clock.now().toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });
});
