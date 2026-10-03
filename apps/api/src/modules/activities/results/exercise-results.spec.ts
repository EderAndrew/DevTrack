import { type Answer, ExerciseResultSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { pointsFor, type ResultQuestion, resultFor } from "./exercise-results";

const choice: ResultQuestion = { id: "q-mc", type: "MULTIPLE_CHOICE", starterCode: null, correctAlternativeId: "alt-right" };
const open: ResultQuestion = { id: "q-open", type: "OPEN_ANSWER", starterCode: null, correctAlternativeId: null };
const code: ResultQuestion = { id: "q-code", type: "CODE", starterCode: "class A {}", correctAlternativeId: null };

const alternative = (alternativeId: string | null): Answer => ({ kind: "ALTERNATIVE", alternativeId });
const text = (value: string): Answer => ({ kind: "TEXT", text: value });
const source = (value: string): Answer => ({ kind: "CODE", source: value });

describe("013/FR-009 resultado de cada exercício na conclusão (contracts/student-status.md)", () => {
  for (const scoring of [true, false]) {
    const row = scoring ? "linha que pontua" : "prática ou já pontuado";

    it(`013/FR-009 Múltipla escolha pela regra EXACT_MATCH: correta → Certo, outra ou branco → Errado (${row})`, async () => {
      expect(await resultFor(choice, alternative("alt-right"), { scoring })).toEqual({ result: "CORRECT", nature: "RULE_RESULT" });
      expect(await resultFor(choice, alternative("alt-wrong"), { scoring })).toEqual({ result: "WRONG", nature: "RULE_RESULT" });
      expect(await resultFor(choice, alternative(null), { scoring })).toEqual({ result: "WRONG", nature: "RULE_RESULT" });
      expect(await resultFor(choice, null, { scoring })).toEqual({ result: "WRONG", nature: "RULE_RESULT" });
    });

    it(`013/FR-009 aberta e código em branco (regra da 012 FR-023) → Errado (${row})`, async () => {
      for (const blank of [null, text(""), text("   ")]) expect(await resultFor(open, blank, { scoring })).toEqual({ result: "WRONG", nature: "RULE_RESULT" });
      for (const blank of [null, source(""), source("  "), source("class A {}")]) {
        expect(await resultFor(code, blank, { scoring })).toEqual({ result: "WRONG", nature: "RULE_RESULT" });
      }
    });
  }

  it("013/FR-009 aberta e código respondidos esperam o professor na linha que pontua", async () => {
    expect(await resultFor(open, text("Herança"), { scoring: true })).toEqual({ result: "PENDING_TEACHER", nature: null });
    expect(await resultFor(code, source("class A { int x; }"), { scoring: true })).toEqual({ result: "PENDING_TEACHER", nature: null });
  });

  it("013/FR-009 aberta e código respondidos fora da linha que pontua ficam sem pontuação (Compare com o gabarito)", async () => {
    expect(await resultFor(open, text("Herança"), { scoring: false })).toEqual({ result: "UNSCORED", nature: null });
    expect(await resultFor(code, source("class A { int x; }"), { scoring: false })).toEqual({ result: "UNSCORED", nature: null });
  });
});

describe("013/FR-010 pontos tudo ou nada", () => {
  it("013/FR-010 os pontos do exercício só para Certo na linha que pontua; o resto vale 0", () => {
    expect(pointsFor("CORRECT", true, 30)).toBe(30);
    for (const result of ["WRONG", "PENDING_TEACHER", "UNSCORED"] as const) expect(pointsFor(result, true, 30)).toBe(0);
    for (const result of ExerciseResultSchema.options) expect(pointsFor(result, false, 60)).toBe(0);
  });
});
