import type { StudentActivitySummary } from "@repo/contracts";
import type { ActivityFacts } from "../../src/modules/activities/status/facts";
import { describe, expect, it } from "vitest";
import {
  afterCursor,
  byDelivery,
  historyCursor,
  historySituation,
  isMissed,
  matchesSearch,
  missedAt,
  type MissedInput,
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

const entry = (n: number, at: string): HistoryEntry => ({
  summary: summary({ id: id(n) }),
  at: new Date(at),
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

  // Amendment 2026-11-23 (research HI11): an activity without a delivery the student can no longer start or continue.
  describe("028/FR-022 isMissed e missedAt", () => {
    const NOW = new Date("2026-11-20T12:00:00.000Z");
    const BEFORE = new Date("2026-11-19T12:00:00.000Z");
    const AFTER = new Date("2026-11-21T12:00:00.000Z");
    const PUBLISHED = new Date("2026-11-01T12:00:00.000Z");
    const common = { activityStatus: "ACTIVE", classActive: true, now: NOW } as const;
    const assignment = (overrides: Partial<Extract<ActivityFacts, { type: "ASSIGNMENT" }>> = {}): ActivityFacts => ({
      ...common,
      type: "ASSIGNMENT",
      deadline: AFTER,
      latePolicy: "REJECT",
      attempt: null,
      submission: null,
      released: false,
      ...overrides,
    });
    const exam = (overrides: Partial<Extract<ActivityFacts, { type: "EXAM" }>> = {}): ActivityFacts => ({
      ...common,
      type: "EXAM",
      startDeadline: AFTER,
      attempt: null,
      submission: null,
      released: false,
      ...overrides,
    });
    const exercise = (overrides: Partial<Extract<ActivityFacts, { type: "EXERCISE" }>> = {}): ActivityFacts => ({
      ...common,
      type: "EXERCISE",
      latestAttempt: null,
      awaitingCorrection: false,
      ...overrides,
    });
    const input = (facts: ActivityFacts, overrides: Partial<MissedInput> = {}): MissedInput => ({
      facts,
      publishAt: PUBLISHED,
      closedAt: null,
      inactiveSince: null,
      ...overrides,
    });
    const submitted = { late: false, gradingComplete: false };

    it("ainda dá para fazer → não é não entregue (pendente, em andamento, atrasada aceitando entrega, prova na janela)", () => {
      expect(isMissed(input(assignment()))).toBe(false);
      expect(isMissed(input(assignment({ attempt: { status: "IN_PROGRESS" } })))).toBe(false);
      expect(isMissed(input(assignment({ deadline: BEFORE, latePolicy: "ACCEPT_MARKED" })))).toBe(false);
      expect(isMissed(input(exam()))).toBe(false);
      expect(isMissed(input(exam({ startDeadline: BEFORE, attempt: { status: "IN_PROGRESS" } })))).toBe(false);
      expect(isMissed(input(exercise({ latestAttempt: { number: 1, status: "IN_PROGRESS" } })))).toBe(false);
    });

    it("entregue ou concluído nunca é não entregue, mesmo encerrado ou com a turma inativa", () => {
      const closed = { activityStatus: "CLOSED", classActive: false } as const;
      expect(isMissed(input(assignment({ ...closed, submission: submitted })))).toBe(false);
      expect(isMissed(input(exam({ ...closed, submission: { endReason: "STUDENT_SUBMITTED", gradingComplete: false } })))).toBe(false);
      expect(isMissed(input(exercise({ ...closed, latestAttempt: { number: 1, status: "SUBMITTED" } })))).toBe(false);
    });

    it("sem entrega e sem como fazer → não entregue: encerrada, turma não ativa, prazo vencido REJECT, janela da prova fechada", () => {
      expect(isMissed(input(assignment({ activityStatus: "CLOSED" })))).toBe(true);
      expect(isMissed(input(assignment({ classActive: false })))).toBe(true);
      expect(isMissed(input(assignment({ deadline: BEFORE })))).toBe(true);
      expect(isMissed(input(assignment({ deadline: BEFORE, attempt: { status: "IN_PROGRESS" } })))).toBe(true);
      expect(isMissed(input(exam({ startDeadline: BEFORE })))).toBe(true);
      expect(isMissed(input(exam({ activityStatus: "CLOSED", attempt: { status: "IN_PROGRESS" } })))).toBe(true);
      expect(isMissed(input(exercise({ activityStatus: "CLOSED" })))).toBe(true);
      expect(isMissed(input(exercise({ classActive: false, latestAttempt: { number: 1, status: "IN_PROGRESS" } })))).toBe(true);
    });

    it("prova retida à espera da decisão nunca é não entregue", () => {
      expect(isMissed(input(exam({ activityStatus: "CLOSED", attempt: { status: "IN_PROGRESS" }, onHold: true })))).toBe(false);
      expect(isMissed(input(exam({ classActive: false, attempt: { status: "IN_PROGRESS" }, onHold: true })))).toBe(false);
    });

    it("missedAt: o mais cedo entre o prazo vencido (REJECT), o encerramento, o fim da janela e a turma não ativa", () => {
      const early = new Date("2026-11-15T12:00:00.000Z");
      const late = new Date("2026-11-18T12:00:00.000Z");
      expect(missedAt(input(assignment({ deadline: early })))).toEqual(early);
      expect(missedAt(input(assignment({ deadline: late, activityStatus: "CLOSED" }), { closedAt: early }))).toEqual(early);
      expect(missedAt(input(assignment({ deadline: early, activityStatus: "CLOSED" }), { closedAt: late }))).toEqual(early);
      expect(missedAt(input(assignment({ classActive: false }), { inactiveSince: early }))).toEqual(early);
      expect(missedAt(input(exam({ startDeadline: early })))).toEqual(early);
      expect(missedAt(input(exam({ startDeadline: late, activityStatus: "CLOSED" }), { closedAt: early }))).toEqual(early);
      expect(missedAt(input(exercise({ activityStatus: "CLOSED" }), { closedAt: late }))).toEqual(late);
      // An ACCEPT_MARKED deadline never closes: only the close does.
      expect(missedAt(input(assignment({ deadline: early, latePolicy: "ACCEPT_MARKED", activityStatus: "CLOSED" }), { closedAt: late }))).toEqual(late);
      // Without any recorded moment (an old row): the publication.
      expect(missedAt(input(assignment({ classActive: false })))).toEqual(PUBLISHED);
    });
  });
});
