import { describe, expect, it } from "vitest";
import { answerFits, answerOfRow, columnsOf, isBlankAnswer, PROGRESS_AUDIT_INTERVAL_MS, progressAuditDue, sameAnswer } from "./answers";

const open = { type: "OPEN_ANSWER" as const, starterCode: null, alternativeIds: [] };
const multiple = { type: "MULTIPLE_CHOICE" as const, starterCode: null, alternativeIds: ["a1", "a2", "a3"] };
const code = { type: "CODE" as const, starterCode: "class Main {}", alternativeIds: [] };

describe("012/FR-020 regras das respostas", () => {
  it("a resposta precisa ser do tipo da questão e, na múltipla escolha, em branco ou de uma alternativa dela", () => {
    expect(answerFits(open, { kind: "TEXT", text: "x" })).toBe(true);
    expect(answerFits(open, { kind: "CODE", source: "x" })).toBe(false);
    expect(answerFits(code, { kind: "CODE", source: "x" })).toBe(true);
    expect(answerFits(code, { kind: "TEXT", text: "x" })).toBe(false);
    expect(answerFits(multiple, { kind: "ALTERNATIVE", alternativeId: "a2" })).toBe(true);
    expect(answerFits(multiple, { kind: "ALTERNATIVE", alternativeId: null })).toBe(true);
    expect(answerFits(multiple, { kind: "ALTERNATIVE", alternativeId: "outra" })).toBe(false);
    expect(answerFits(multiple, { kind: "TEXT", text: "a2" })).toBe(false);
    expect(answerFits(open, { kind: "ALTERNATIVE", alternativeId: null })).toBe(false);
  });

  it("mesmo conteúdo só com o mesmo tipo e o mesmo valor (sem trim)", () => {
    expect(sameAnswer({ kind: "TEXT", text: "a" }, { kind: "TEXT", text: "a" })).toBe(true);
    expect(sameAnswer({ kind: "TEXT", text: "a" }, { kind: "TEXT", text: "a " })).toBe(false);
    expect(sameAnswer({ kind: "ALTERNATIVE", alternativeId: null }, { kind: "ALTERNATIVE", alternativeId: null })).toBe(true);
    expect(sameAnswer({ kind: "ALTERNATIVE", alternativeId: "a1" }, { kind: "ALTERNATIVE", alternativeId: "a2" })).toBe(false);
    expect(sameAnswer({ kind: "CODE", source: "x" }, { kind: "CODE", source: "x" })).toBe(true);
    expect(sameAnswer({ kind: "CODE", source: "x" }, { kind: "TEXT", text: "x" })).toBe(false);
  });

  it("012/FR-023 em branco: sem resposta, sem alternativa, texto vazio após trim, código vazio ou igual ao inicial", () => {
    expect(isBlankAnswer(open, null)).toBe(true);
    expect(isBlankAnswer(open, { kind: "TEXT", text: "  \n " })).toBe(true);
    expect(isBlankAnswer(open, { kind: "TEXT", text: " x " })).toBe(false);
    expect(isBlankAnswer(multiple, { kind: "ALTERNATIVE", alternativeId: null })).toBe(true);
    expect(isBlankAnswer(multiple, { kind: "ALTERNATIVE", alternativeId: "a1" })).toBe(false);
    expect(isBlankAnswer(code, { kind: "CODE", source: "  " })).toBe(true);
    expect(isBlankAnswer(code, { kind: "CODE", source: "class Main {}" })).toBe(true);
    expect(isBlankAnswer(code, { kind: "CODE", source: "class Main { int x; }" })).toBe(false);
  });

  it("012/FR-018 progresso auditado na primeira gravação e de novo só a partir de 15 minutos", () => {
    const at = new Date("2026-10-01T12:00:00.000Z");
    expect(progressAuditDue(null, at)).toBe(true);
    expect(progressAuditDue(at, new Date(at.getTime() + PROGRESS_AUDIT_INTERVAL_MS - 1))).toBe(false);
    expect(progressAuditDue(at, new Date(at.getTime() + PROGRESS_AUDIT_INTERVAL_MS))).toBe(true);
  });

  it("colunas tipadas ida e volta", () => {
    for (const [type, answer] of [
      ["OPEN_ANSWER", { kind: "TEXT", text: "t" }],
      ["MULTIPLE_CHOICE", { kind: "ALTERNATIVE", alternativeId: "a1" }],
      ["MULTIPLE_CHOICE", { kind: "ALTERNATIVE", alternativeId: null }],
      ["CODE", { kind: "CODE", source: "s" }],
    ] as const) {
      expect(answerOfRow({ questionType: type, ...columnsOf(answer) })).toEqual(answer);
    }
  });
});
