import { LatePolicySchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import type { ActivityFacts } from "./facts";
import { acceptanceRefusal, canAnswer, decideOperation, type StudentOperation } from "./operations";
import { deriveRosterStatus } from "./roster-status";
import { deriveStudentStatus, isResultVisible, isUrgent, URGENT_WITHIN_MS } from "./student-status";

const DEADLINE = new Date("2026-10-10T23:59:00.000Z");
const at = (offsetMs: number) => new Date(DEADLINE.getTime() + offsetMs);
const HOUR = 3_600_000;

const facts = (overrides: Partial<ActivityFacts> = {}): ActivityFacts => ({
  activityStatus: "ACTIVE",
  deadline: DEADLINE,
  latePolicy: "REJECT",
  classActive: true,
  attempt: null,
  submission: null,
  released: false,
  now: at(-3 * 24 * HOUR),
  ...overrides,
});

const inProgress = { attempt: { status: "IN_PROGRESS" as const } };
const submitted = (late = false, gradingComplete = false) => ({
  attempt: { status: "SUBMITTED" as const },
  submission: { late, gradingComplete },
});

/** Every combination of the facts, with the clock before, at and after the deadline. */
function* everyCombination(): Generator<ActivityFacts> {
  for (const activityStatus of ["ACTIVE", "CLOSED"] as const)
    for (const latePolicy of LatePolicySchema.options)
      for (const classActive of [true, false])
        for (const released of [true, false])
          for (const now of [at(-49 * HOUR), at(-47 * HOUR), at(0), at(1), at(5 * 24 * HOUR)])
            for (const state of [{}, inProgress, submitted(false, false), submitted(false, true), submitted(true, false), submitted(true, true)])
              yield facts({ activityStatus, latePolicy, classActive, released, now, ...state });
}

describe("012/FR-014 situação do aluno derivada no servidor (contracts/student-status.md)", () => {
  it("012/SC-007 PENDENTE → EM_ANDAMENTO → ENTREGUE → CORRIGIDO dentro do prazo", () => {
    expect(deriveStudentStatus(facts())).toBe("PENDING");
    expect(deriveStudentStatus(facts(inProgress))).toBe("IN_PROGRESS");
    expect(deriveStudentStatus(facts(submitted()))).toBe("SUBMITTED");
    expect(deriveStudentStatus(facts({ ...submitted(false, true), released: true }))).toBe("GRADED");
  });

  it("012/FR-029 corrigida sem liberação, ou liberada com questão pendente, continua ENTREGUE", () => {
    expect(deriveStudentStatus(facts(submitted(false, true)))).toBe("SUBMITTED");
    expect(deriveStudentStatus(facts({ ...submitted(false, false), released: true }))).toBe("SUBMITTED");
    expect(isResultVisible(facts({ ...submitted(false, false), released: true }))).toBe(false);
    expect(isResultVisible(facts({ ...submitted(false, true), released: true }))).toBe(true);
  });

  it("012/FR-015 o prazo passa: pendente e em andamento viram ATRASADO; no instante do prazo ainda não", () => {
    expect(deriveStudentStatus(facts({ now: at(0) }))).toBe("PENDING");
    expect(deriveStudentStatus(facts({ now: at(1) }))).toBe("OVERDUE");
    expect(deriveStudentStatus(facts({ ...inProgress, now: at(1) }))).toBe("OVERDUE");
    expect(deriveStudentStatus(facts({ ...submitted(true), now: at(1) }))).toBe("SUBMITTED");
  });

  it("atividade encerrada sem entrega é ATRASADO, mesmo antes do prazo", () => {
    expect(deriveStudentStatus(facts({ activityStatus: "CLOSED" }))).toBe("OVERDUE");
    expect(deriveStudentStatus(facts({ activityStatus: "CLOSED", ...inProgress }))).toBe("OVERDUE");
  });

  it("012/SC-007 em todas as combinações: CORRIGIDO só liberado e completo; ATRASADO só sem entrega e com prazo vencido ou encerrada", () => {
    for (const combination of everyCombination()) {
      const status = deriveStudentStatus(combination);
      const past = combination.now > combination.deadline;
      expect(status === "GRADED").toBe(combination.released && combination.submission?.gradingComplete === true);
      expect(["SUBMITTED", "GRADED"].includes(status)).toBe(combination.submission !== null);
      expect(status === "OVERDUE").toBe(combination.submission === null && (past || combination.activityStatus === "CLOSED"));
    }
  });
});

describe("012/FR-011 urgência", () => {
  it("vence em até 48 h e não entregue → urgente; 49 h → não; entregue nunca", () => {
    expect(isUrgent(facts({ now: at(-URGENT_WITHIN_MS) }))).toBe(true);
    expect(isUrgent(facts({ now: at(-47 * HOUR) }))).toBe(true);
    expect(isUrgent(facts({ now: at(-49 * HOUR) }))).toBe(false);
    expect(isUrgent(facts({ ...submitted(), now: at(-HOUR) }))).toBe(false);
  });

  it("atrasada que ainda aceita entrega é urgente; a que não aceita, não", () => {
    expect(isUrgent(facts({ now: at(HOUR), latePolicy: "ACCEPT_MARKED" }))).toBe(true);
    expect(isUrgent(facts({ now: at(HOUR), latePolicy: "REJECT" }))).toBe(false);
    expect(isUrgent(facts({ activityStatus: "CLOSED", latePolicy: "ACCEPT_MARKED" }))).toBe(false);
  });
});

describe("012/FR-021 012/FR-024a o que o aluno pode fazer", () => {
  const decide = (operation: StudentOperation, overrides: Partial<ActivityFacts>) => decideOperation(operation, facts(overrides));

  it("dentro do prazo: iniciar, salvar e entregar; repetir o início devolve a mesma tentativa", () => {
    expect(decide("START", {})).toEqual({ kind: "ALLOWED" });
    expect(decide("START", inProgress)).toEqual({ kind: "REPEAT" });
    expect(decide("SAVE", inProgress)).toEqual({ kind: "ALLOWED" });
    expect(decide("SUBMIT", inProgress)).toEqual({ kind: "ALLOWED" });
  });

  it("salvar ou entregar sem iniciar → NOT_STARTED", () => {
    expect(decide("SAVE", {})).toEqual({ kind: "REFUSED", code: "NOT_STARTED" });
    expect(decide("SUBMIT", {})).toEqual({ kind: "REFUSED", code: "NOT_STARTED" });
  });

  it("012/FR-025 já entregue: entregar de novo é repetição idempotente; salvar é recusado", () => {
    expect(decide("SUBMIT", submitted())).toEqual({ kind: "REPEAT" });
    expect(decide("START", submitted())).toEqual({ kind: "REPEAT" });
    expect(decide("SAVE", submitted())).toEqual({ kind: "REFUSED", code: "ATTEMPT_ALREADY_SUBMITTED" });
    expect(decide("SUBMIT", { ...submitted(), activityStatus: "CLOSED", now: at(HOUR) })).toEqual({ kind: "REPEAT" });
  });

  it("depois do prazo: REJECT recusa tudo com DEADLINE_PASSED; ACCEPT_MARKED permite", () => {
    for (const operation of ["START", "SAVE", "SUBMIT"] as const) {
      expect(decide(operation, { ...inProgress, now: at(1) })).toEqual({ kind: "REFUSED", code: "DEADLINE_PASSED" });
    }
    expect(decide("SAVE", { ...inProgress, now: at(1), latePolicy: "ACCEPT_MARKED" })).toEqual({ kind: "ALLOWED" });
    expect(decide("SUBMIT", { ...inProgress, now: at(5 * 24 * HOUR), latePolicy: "ACCEPT_MARKED" })).toEqual({ kind: "ALLOWED" });
    expect(decide("SAVE", { ...inProgress, now: at(0) })).toEqual({ kind: "ALLOWED" });
  });

  it("encerrada recusa com ACTIVITY_CLOSED qualquer que seja a regra; turma inativa com CLASS_NOT_ACTIVE", () => {
    for (const latePolicy of LatePolicySchema.options) {
      expect(decide("SUBMIT", { ...inProgress, activityStatus: "CLOSED", latePolicy })).toEqual({ kind: "REFUSED", code: "ACTIVITY_CLOSED" });
    }
    expect(decide("START", { classActive: false })).toEqual({ kind: "REFUSED", code: "CLASS_NOT_ACTIVE" });
  });

  it("em todas as combinações: canAnswer ⇔ sem entrega e o início não é recusado; entregue nunca salva", () => {
    for (const combination of everyCombination()) {
      expect(canAnswer(combination)).toBe(combination.submission === null && decideOperation("START", combination).kind !== "REFUSED");
      if (combination.submission) expect(decideOperation("SAVE", combination)).toEqual({ kind: "REFUSED", code: "ATTEMPT_ALREADY_SUBMITTED" });
      const blocked = !combination.classActive || combination.activityStatus === "CLOSED";
      if (blocked && !combination.submission) expect(canAnswer(combination)).toBe(false);
    }
  });
});

describe("012/FR-006 situação na lista do professor e aceite da tentativa", () => {
  it("não iniciou, em andamento, entregou, entregou com atraso, não entregou", () => {
    expect(deriveRosterStatus(facts())).toBe("NOT_STARTED");
    expect(deriveRosterStatus(facts(inProgress))).toBe("IN_PROGRESS");
    expect(deriveRosterStatus(facts(submitted(false)))).toBe("SUBMITTED");
    expect(deriveRosterStatus(facts(submitted(true)))).toBe("SUBMITTED_LATE");
    expect(deriveRosterStatus(facts({ ...inProgress, now: at(1) }))).toBe("MISSED");
    expect(deriveRosterStatus(facts({ activityStatus: "CLOSED" }))).toBe("MISSED");
    expect(deriveRosterStatus(facts({ ...inProgress, now: at(1), latePolicy: "ACCEPT_MARKED" }))).toBe("IN_PROGRESS");
  });

  it("012/FR-006b o professor só aceita a tentativa de quem não pode mais entregar", () => {
    expect(acceptanceRefusal(facts({ ...inProgress, now: at(1) }))).toBeNull();
    expect(acceptanceRefusal(facts({ ...inProgress, activityStatus: "CLOSED" }))).toBeNull();
    expect(acceptanceRefusal(facts(inProgress))).toBe("STUDENT_CAN_STILL_SUBMIT");
    expect(acceptanceRefusal(facts({ ...inProgress, now: at(1), latePolicy: "ACCEPT_MARKED" }))).toBe("STUDENT_CAN_STILL_SUBMIT");
    expect(acceptanceRefusal(facts({ now: at(1) }))).toBe("NOT_STARTED");
    expect(acceptanceRefusal(facts({ ...submitted(true), now: at(1) }))).toBeNull();
  });
});
