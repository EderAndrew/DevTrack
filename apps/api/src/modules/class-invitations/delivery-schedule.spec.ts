import { describe, expect, it } from "vitest";
import { FIRST_ATTEMPT_GRACE_MS, MAX_DELIVERY_ATTEMPTS, nextAttemptAfter } from "./delivery-schedule";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-09-23T12:00:00.000Z");

describe("delivery-schedule (003/FR-019, contracts/mail-delivery.md)", () => {
  it.each([
    [1, 1 * MINUTE],
    [2, 5 * MINUTE],
    [3, 15 * MINUTE],
    [4, 1 * HOUR],
    [5, 3 * HOUR],
    [6, 6 * HOUR],
  ])("depois da %iª falha a próxima tentativa é em %i ms", (failures, wait) => {
    expect(nextAttemptAfter(failures, NOW)).toEqual(new Date(NOW.getTime() + wait));
  });

  it("na 7ª falha não há nova tentativa (FAILED)", () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(7);
    expect(nextAttemptAfter(7, NOW)).toBeNull();
    expect(nextAttemptAfter(8, NOW)).toBeNull();
  });

  it("a 1ª tentativa tem 1 min para registrar o resultado antes de o worker assumir", () => {
    expect(FIRST_ATTEMPT_GRACE_MS).toBe(MINUTE);
  });

  it("recusa número de falhas menor que 1", () => {
    expect(() => nextAttemptAfter(0, NOW)).toThrow(RangeError);
  });
});
