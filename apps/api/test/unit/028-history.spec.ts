import type { StudentActivitySummary } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  afterCursor,
  byDelivery,
  historyCursor,
  historySituation,
  matchesSearch,
  normalizeSearch,
  type HistoryEntry,
} from "../../src/modules/student-activities/history";

/** 028 research HI3–HI6: the pure parts of the student's "Histórico" (situation, order, cursor, search). */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const summary = (overrides: Partial<StudentActivitySummary> = {}): StudentActivitySummary =>
  ({
    id: id(1),
    type: "ASSIGNMENT",
    title: "Trabalho",
    status: "SUBMITTED",
    result: null,
    points: null,
    ...overrides,
  }) as StudentActivitySummary;

const RESULT = { totalGrade: "1.80", maxGrade: "3.00", hasFeedback: false } as unknown as StudentActivitySummary["result"];

const entry = (n: number, deliveredAt: string): HistoryEntry => ({
  summary: summary({ id: id(n) }),
  deliveredAt: new Date(deliveredAt),
});

describe("028 histórico — funções puras", () => {
  describe("028/FR-002 historySituation", () => {
    it("trabalho e prova com result → GRADED; sem result → AWAITING", () => {
      for (const type of ["ASSIGNMENT", "EXAM"] as const) {
        expect(historySituation(summary({ type, status: "GRADED", result: RESULT }))).toBe("GRADED");
        // não liberado, liberado com correção incompleta ou sem notas.proprias.visualizar: o result é null.
        expect(historySituation(summary({ type, status: "SUBMITTED", result: null }))).toBe("AWAITING");
        expect(historySituation(summary({ type, status: "GRADED", result: null }))).toBe("AWAITING");
      }
    });

    it("exercício com pontos aguardando correção → AWAITING; sem → GRADED", () => {
      const exercise = (awaitingCorrection: boolean) =>
        summary({ type: "EXERCISE", status: "COMPLETED", points: { possible: 30, earned: 15, awaitingCorrection } });
      expect(historySituation(exercise(true))).toBe("AWAITING");
      expect(historySituation(exercise(false))).toBe("GRADED");
    });
  });

  describe("028/FR-008 ordem e cursor", () => {
    const entries = [
      entry(3, "2026-11-10T10:00:00.000Z"),
      entry(2, "2026-11-12T10:00:00.000Z"),
      entry(4, "2026-11-12T10:00:00.000Z"),
      entry(1, "2026-11-11T10:00:00.000Z"),
    ];

    it("byDelivery: entrega mais recente primeiro, empate pelo id crescente", () => {
      expect([...entries].sort(byDelivery).map((item) => item.summary.id)).toEqual([id(2), id(4), id(1), id(3)]);
    });

    it("o cursor retoma depois do último item, mesmo com duas entregas no mesmo instante", () => {
      const sorted = [...entries].sort(byDelivery);
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < sorted.length; page += 1) {
        const rest = cursor === null ? sorted : sorted.filter(afterCursor(cursor));
        const first = rest[0]!;
        seen.push(first.summary.id);
        cursor = historyCursor(first);
      }
      expect(seen).toEqual([id(2), id(4), id(1), id(3)]);
      expect(sorted.filter(afterCursor(cursor!))).toEqual([]);
    });

    it("um cursor que não foi gerado pela API → 400", () => {
      expect(() => afterCursor("não-é-um-cursor")).toThrow();
    });
  });

  describe("028/FR-005 busca", () => {
    it("normalizeSearch ignora caixa e acentos", () => {
      expect(normalizeSearch("PRÓVA de Lógica")).toBe("prova de logica");
    });

    it("'Prova', 'PROVA' e 'próva' casam com 'prova de teste'; espaços nas pontas não contam", () => {
      for (const q of ["Prova", "PROVA", "próva", "  prova  "]) expect(matchesSearch("prova de teste", q)).toBe(true);
      expect(matchesSearch("prova de teste", "lista")).toBe(false);
    });

    it("um texto com caracteres de expressão regular é texto, nunca um padrão", () => {
      expect(matchesSearch("Trabalho final", ".*(")).toBe(false);
      expect(matchesSearch("Exercício .*( de regex", ".*(")).toBe(true);
    });

    it("busca vazia casa com tudo", () => {
      expect(matchesSearch("qualquer", "")).toBe(true);
      expect(matchesSearch("qualquer", undefined)).toBe(true);
    });
  });
});
