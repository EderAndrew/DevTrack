import { describe, expect, it } from "vitest";
import { canReturn, type ExamStudentFacts, examStatusOf } from "./exam-status";

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 12, 13, minutes));
const DEADLINE = at(15);
const facts = (overrides: Partial<ExamStudentFacts> = {}): ExamStudentFacts => ({
  markedAt: at(0),
  startedAt: at(2),
  endReason: null,
  holdOpen: false,
  pauseOpen: false,
  ...overrides,
});

describe("018/FR-025 situação de cada aluno na prova, derivada na leitura (data-model \"Derived\")", () => {
  it("sem presença: não marcado; presente sem tentativa: pode iniciar até o limite, depois não iniciou", () => {
    expect(examStatusOf(facts({ markedAt: null, startedAt: null }), DEADLINE, at(1))).toBe("NOT_MARKED");
    expect(examStatusOf(facts({ startedAt: null }), DEADLINE, at(15))).toBe("PRESENT");
    expect(examStatusOf(facts({ startedAt: null }), DEADLINE, at(16))).toBe("START_CLOSED");
  });

  it("a retenção aberta vem antes de tudo; depois, o motivo do fim, a pausa e o respondendo", () => {
    expect(examStatusOf(facts({ holdOpen: true, pauseOpen: true }), DEADLINE, at(20))).toBe("AWAITING_DECISION");
    expect(examStatusOf(facts({ endReason: "STUDENT_SUBMITTED", pauseOpen: true }), DEADLINE, at(20))).toBe("SUBMITTED");
    expect(examStatusOf(facts({ endReason: "TIME_EXPIRED" }), DEADLINE, at(80))).toBe("TIME_EXPIRED");
    expect(examStatusOf(facts({ endReason: "ACTIVITY_CLOSED" }), DEADLINE, at(80))).toBe("ACTIVITY_CLOSED");
    expect(examStatusOf(facts({ endReason: "ENDED_BY_WARNINGS" }), DEADLINE, at(80))).toBe("ENDED_BY_WARNINGS");
    expect(examStatusOf(facts({ endReason: "CANCELLED" }), DEADLINE, at(80))).toBe("CANCELLED");
    expect(examStatusOf(facts({ pauseOpen: true }), DEADLINE, at(20))).toBe("PAUSED");
    expect(examStatusOf(facts(), DEADLINE, at(80))).toBe("ANSWERING");
  });

  it("018/FR-022 devolver só com a retenção aberta, tempo restante e a atividade ativa", () => {
    const open = { resolution: null };
    expect(canReturn(open, at(40), "ACTIVE", at(39))).toBe(true);
    expect(canReturn(open, at(40), "ACTIVE", at(40))).toBe(false);
    expect(canReturn(open, at(40), "CLOSED", at(39))).toBe(false);
    expect(canReturn(open, at(40), "CANCELLED", at(39))).toBe(false);
    expect(canReturn({ resolution: "RETURNED" }, at(40), "ACTIVE", at(39))).toBe(false);
  });
});
