import type { StudentActivitySummary } from "@repo/contracts";
import type { ActivityFacts } from "../../src/modules/activities/status/facts";
import { describe, expect, it } from "vitest";
import {
  afterCursor,
  byDelivery,
  historyCursor,
  historySituation,
  type HistoryInput,
  inHistory,
  matchesSearch,
  normalizeSearch,
  rowDate,
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

const entry = (n: number, at: string): HistoryEntry => ({
  summary: summary({ id: id(n) }),
  at: new Date(at),
});

describe("028 histórico — funções puras", () => {
  describe("028/FR-002 historySituation", () => {
    // 029/FR-002: the situation reads the closed activity's delivery as well as the summary's `result`.
    const closed = (type: "ASSIGNMENT" | "EXAM"): HistoryInput =>
      ({
        type,
        facts: { type, activityStatus: "CLOSED" },
        submission: { submittedAt: new Date("2026-11-10T12:00:00.000Z") },
        closedAt: new Date("2026-11-15T12:00:00.000Z"),
        cancelledAt: null,
      }) as HistoryInput;

    it("trabalho e prova com result → GRADED; sem result → AWAITING", () => {
      for (const type of ["ASSIGNMENT", "EXAM"] as const) {
        expect(historySituation(closed(type), summary({ type, status: "GRADED", result: RESULT }))).toBe("GRADED");
        // não liberado, liberado com correção incompleta ou sem notas.proprias.visualizar: o result é null.
        expect(historySituation(closed(type), summary({ type, status: "SUBMITTED", result: null }))).toBe("AWAITING");
        expect(historySituation(closed(type), summary({ type, status: "GRADED", result: null }))).toBe("AWAITING");
      }
    });

    it("exercício nunca está no Histórico (029/FR-001), com ou sem pontos aguardando correção", () => {
      // 029/FR-001: exercises stay in "Minhas atividades"; 028 gave them AWAITING/GRADED here.
      const exercise = { type: "EXERCISE", facts: { type: "EXERCISE", activityStatus: "CLOSED" } } as HistoryInput;
      expect(inHistory(exercise)).toBe(false);
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

  // 029/FR-002: the amendment's "não entregue" (HI11, `isMissed`/`missedAt`) is replaced by the closed activity without a
  // delivery, dated by its close (029 research HC4); `test/unit/029-placement.spec.ts` covers the rest of the rule.
  describe("028/FR-022 não entregue", () => {
    const facts = (overrides: Record<string, unknown> = {}): ActivityFacts =>
      ({
        type: "ASSIGNMENT",
        activityStatus: "CLOSED",
        classActive: true,
        now: new Date("2026-11-20T12:00:00.000Z"),
        deadline: new Date("2026-11-25T12:00:00.000Z"),
        latePolicy: "REJECT",
        attempt: null,
        submission: null,
        released: false,
        ...overrides,
      }) as ActivityFacts;
    const closedAt = new Date("2026-11-15T12:00:00.000Z");
    const row = (overrides: Partial<HistoryInput> = {}): HistoryInput => ({
      type: "ASSIGNMENT",
      facts: facts(),
      submission: null,
      closedAt,
      cancelledAt: null,
      ...overrides,
    });

    it("encerrada sem entrega → MISSED, datada pelo encerramento", () => {
      expect(historySituation(row(), { result: null })).toBe("MISSED");
      expect(rowDate(row())).toEqual(closedAt);
    });

    it("uma ativa sem entrega, mesmo sem como fazer, fica em \"Minhas atividades\" (029/FR-007)", () => {
      expect(inHistory(row({ facts: facts({ activityStatus: "ACTIVE", classActive: false }), closedAt: null }))).toBe(false);
    });

    it("prova retida à espera da decisão nunca é não entregue", () => {
      const held = row({ type: "EXAM", facts: facts({ type: "EXAM", startDeadline: closedAt, attempt: { status: "IN_PROGRESS" }, onHold: true }) });
      expect(historySituation(held, { result: null })).toBe("AWAITING");
    });
  });
});
