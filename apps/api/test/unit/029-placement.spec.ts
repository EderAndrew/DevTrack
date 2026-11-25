import type { ActivityStatus, ActivityType, StudentActivitySummary } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import type { ActivityFacts } from "../../src/modules/activities/status/facts";
import {
  afterCursor,
  byDelivery,
  deliveredAt,
  endedAt,
  historyCursor,
  historySituation,
  type HistoryEntry,
  type HistoryInput,
  inHistory,
  inList,
  rowDate,
} from "../../src/modules/student-activities/history";

/** 029 research HC1, HC4: where an activity lives (Histórico or "Minhas atividades"), its situation and its date. */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = new Date("2026-11-20T12:00:00.000Z");
const PUBLISHED = new Date("2026-11-01T12:00:00.000Z");
const DEADLINE = new Date("2026-11-25T12:00:00.000Z");
const SUBMITTED = new Date("2026-11-10T12:00:00.000Z");
const CLOSED = new Date("2026-11-15T12:00:00.000Z");
const CANCELLED = new Date("2026-11-16T12:00:00.000Z");

const factsOf = (type: ActivityType, activityStatus: ActivityStatus, overrides: Record<string, unknown> = {}): ActivityFacts => {
  const common = { activityStatus, classActive: true, now: NOW };
  if (type === "EXERCISE") return { ...common, type, latestAttempt: null, awaitingCorrection: false, ...overrides } as ActivityFacts;
  if (type === "EXAM") return { ...common, type, startDeadline: DEADLINE, attempt: null, submission: null, released: false, ...overrides } as ActivityFacts;
  return { ...common, type, deadline: DEADLINE, latePolicy: "REJECT", attempt: null, submission: null, released: false, ...overrides } as ActivityFacts;
};

const submission = { submittedAt: SUBMITTED, late: false, acceptedByTeacher: false, blankCount: 0, gradeCents: 0, generalFeedback: null, gradings: [] };

const input = (
  type: ActivityType,
  activityStatus: ActivityStatus,
  overrides: { delivered?: boolean; facts?: Record<string, unknown> } = {},
): HistoryInput =>
  ({
    type,
    facts: factsOf(type, activityStatus, overrides.facts),
    submission: overrides.delivered ? submission : null,
    closedAt: activityStatus === "CLOSED" ? CLOSED : null,
    cancelledAt: activityStatus === "CANCELLED" ? CANCELLED : null,
  }) as HistoryInput;

const RESULT = { grade: "8.00", hasFeedback: false } as StudentActivitySummary["result"];

describe("029 lugar de cada atividade — funções puras", () => {
  describe("029/FR-001 029/FR-007 inHistory e inList", () => {
    const TYPES: ActivityType[] = ["EXERCISE", "ASSIGNMENT", "EXAM"];
    const STATUSES: ActivityStatus[] = ["ACTIVE", "CLOSED", "CANCELLED"];

    it("cada tipo × status está em exatamente uma das duas telas", () => {
      for (const type of TYPES) {
        for (const status of STATUSES) {
          for (const delivered of [false, true]) {
            const row = input(type, status, { delivered });
            expect(inHistory(row) !== inList(row), `${type} ${status}`).toBe(true);
          }
        }
      }
    });

    it("só trabalhos e provas encerrados ou cancelados vão para o Histórico", () => {
      for (const type of ["ASSIGNMENT", "EXAM"] as const) {
        expect(inHistory(input(type, "CLOSED"))).toBe(true);
        expect(inHistory(input(type, "CANCELLED"))).toBe(true);
        expect(inHistory(input(type, "ACTIVE"))).toBe(false);
        // Delivered or not, an active work or exam stays in "Minhas atividades".
        expect(inList(input(type, "ACTIVE", { delivered: true }))).toBe(true);
      }
    });

    it("todo exercício fica em \"Minhas atividades\", ativo ou encerrado, concluído ou não", () => {
      for (const status of STATUSES) {
        expect(inList(input("EXERCISE", status))).toBe(true);
        expect(inList(input("EXERCISE", status, { facts: { latestAttempt: { number: 1, status: "SUBMITTED" } } }))).toBe(true);
      }
    });

    it("a turma ou a disciplina inativa não move a linha (só o ato do professor na atividade)", () => {
      expect(inList(input("ASSIGNMENT", "ACTIVE", { facts: { classActive: false } }))).toBe(true);
      expect(inHistory(input("ASSIGNMENT", "CLOSED", { facts: { classActive: false } }))).toBe(true);
    });
  });

  describe("029/FR-002 historySituation", () => {
    it("encerrada com entrega: AWAITING até o resultado ficar visível, depois GRADED (028/FR-002)", () => {
      for (const type of ["ASSIGNMENT", "EXAM"] as const) {
        expect(historySituation(input(type, "CLOSED", { delivered: true }), { result: null })).toBe("AWAITING");
        expect(historySituation(input(type, "CLOSED", { delivered: true }), { result: RESULT })).toBe("GRADED");
      }
    });

    it("prova encerrada retida, sem entrega, aguarda a decisão do professor (AWAITING)", () => {
      const held = input("EXAM", "CLOSED", { facts: { attempt: { status: "IN_PROGRESS" }, onHold: true } });
      expect(historySituation(held, { result: null })).toBe("AWAITING");
    });

    it("encerrada sem entrega → MISSED", () => {
      expect(historySituation(input("ASSIGNMENT", "CLOSED"), { result: null })).toBe("MISSED");
      expect(historySituation(input("ASSIGNMENT", "CLOSED", { facts: { attempt: { status: "IN_PROGRESS" } } }), { result: null })).toBe("MISSED");
      expect(historySituation(input("EXAM", "CLOSED"), { result: null })).toBe("MISSED");
    });

    it("cancelada → CANCELLED, com ou sem entrega, mesmo com resultado", () => {
      for (const type of ["ASSIGNMENT", "EXAM"] as const) {
        expect(historySituation(input(type, "CANCELLED"), { result: null })).toBe("CANCELLED");
        expect(historySituation(input(type, "CANCELLED", { delivered: true }), { result: RESULT })).toBe("CANCELLED");
      }
    });
  });

  describe("029/FR-006 datas da linha", () => {
    it("endedAt: closedAt para a encerrada, cancelledAt para a cancelada", () => {
      expect(endedAt(input("ASSIGNMENT", "CLOSED"))).toEqual(CLOSED);
      expect(endedAt(input("EXAM", "CANCELLED"))).toEqual(CANCELLED);
      // Closed, then cancelled: the cancellation is what ended it.
      expect(endedAt({ ...input("ASSIGNMENT", "CANCELLED"), closedAt: CLOSED })).toEqual(CANCELLED);
    });

    it("endedAt de uma atividade ativa é um erro de programação (nunca está no Histórico)", () => {
      expect(() => endedAt(input("ASSIGNMENT", "ACTIVE"))).toThrow();
    });

    it("deliveredAt é a entrega; a data da linha é deliveredAt ?? endedAt", () => {
      expect(deliveredAt(input("ASSIGNMENT", "CLOSED", { delivered: true }))).toEqual(SUBMITTED);
      expect(deliveredAt(input("ASSIGNMENT", "CLOSED"))).toBeNull();
      expect(rowDate(input("ASSIGNMENT", "CLOSED", { delivered: true }))).toEqual(SUBMITTED);
      expect(rowDate(input("ASSIGNMENT", "CLOSED"))).toEqual(CLOSED);
      expect(rowDate(input("EXAM", "CANCELLED", { delivered: true }))).toEqual(SUBMITTED);
      expect(rowDate(input("EXAM", "CANCELLED"))).toEqual(CANCELLED);
    });

    it("ordem e cursor estáveis com datas iguais (uma entrega e um encerramento no mesmo instante)", () => {
      const entry = (n: number, row: HistoryInput): HistoryEntry => ({ summary: { id: id(n) } as StudentActivitySummary, at: rowDate(row) });
      const entries = [
        entry(3, input("ASSIGNMENT", "CLOSED")),
        entry(1, { ...input("ASSIGNMENT", "CLOSED", { delivered: true }), submission: { ...submission, submittedAt: CLOSED } }),
        entry(2, input("EXAM", "CANCELLED")),
        entry(4, input("EXAM", "CLOSED", { delivered: true })),
      ];
      const sorted = [...entries].sort(byDelivery);
      expect(sorted.map((item) => item.summary.id)).toEqual([id(2), id(1), id(3), id(4)]);
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < sorted.length; page += 1) {
        const first = (cursor === null ? sorted : sorted.filter(afterCursor(cursor)))[0]!;
        seen.push(first.summary.id);
        cursor = historyCursor(first);
      }
      expect(seen).toEqual([id(2), id(1), id(3), id(4)]);
    });
  });
});
