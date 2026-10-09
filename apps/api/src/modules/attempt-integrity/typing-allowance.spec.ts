import { describe, expect, it } from "vitest";
import { allowedGrowth, withinTypingAllowance } from "./typing-allowance";

const LIMITS = { typingBurstChars: 400, typingCharsPerSecond: 15 };
const START = new Date("2026-10-01T12:00:00.000Z");
const after = (seconds: number) => new Date(START.getTime() + seconds * 1_000);
const chars = (count: number) => "x".repeat(count);

describe("015/FR-013c limite de digitação no servidor (research F7)", () => {
  it("a rajada vale sem tempo nenhum: 400 caracteres passam, 401 não", () => {
    expect(allowedGrowth(START, START, LIMITS)).toBe(400);
    expect(withinTypingAllowance({ before: "", after: chars(400), since: START, now: START }, LIMITS)).toBe(true);
    expect(withinTypingAllowance({ before: "", after: chars(401), since: START, now: START }, LIMITS)).toBe(false);
  });

  it("cada segundo desde o último salvamento acrescenta 15 caracteres (limites exatos)", () => {
    expect(allowedGrowth(START, after(10), LIMITS)).toBe(550);
    expect(withinTypingAllowance({ before: chars(100), after: chars(650), since: START, now: after(10) }, LIMITS)).toBe(true);
    expect(withinTypingAllowance({ before: chars(100), after: chars(651), since: START, now: after(10) }, LIMITS)).toBe(false);
  });

  it("só segundos inteiros contam e um relógio para trás não dá folga negativa", () => {
    expect(allowedGrowth(START, new Date(START.getTime() + 1_999), LIMITS)).toBe(415);
    expect(allowedGrowth(START, new Date(START.getTime() - 60_000), LIMITS)).toBe(400);
  });

  it("a primeira resposta conta desde o início da tentativa: digitar devagar por muito tempo nunca é recusado", () => {
    const thirtyMinutes = after(30 * 60);
    expect(withinTypingAllowance({ before: "", after: chars(5_000), since: START, now: thirtyMinutes }, LIMITS)).toBe(true);
  });

  it("encolher ou manter o tamanho é sempre permitido", () => {
    expect(withinTypingAllowance({ before: chars(10_000), after: "", since: START, now: START }, LIMITS)).toBe(true);
    expect(withinTypingAllowance({ before: chars(900), after: "y".repeat(900), since: START, now: START }, LIMITS)).toBe(true);
  });

  it("os limites vêm da configuração", () => {
    const strict = { typingBurstChars: 10, typingCharsPerSecond: 1 };
    expect(withinTypingAllowance({ before: "", after: chars(15), since: START, now: after(5) }, strict)).toBe(true);
    expect(withinTypingAllowance({ before: "", after: chars(16), since: START, now: after(5) }, strict)).toBe(false);
  });
});
