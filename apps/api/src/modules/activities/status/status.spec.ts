import { LatePolicySchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import type { AssignmentFacts, ExerciseFacts } from "./facts";
import { acceptanceRefusal, canAnswer, decideOperation, type StudentOperation } from "./operations";
import { deriveRosterStatus } from "./roster-status";
import { deriveStudentStatus, isResultVisible, isUrgent, URGENT_WITHIN_MS } from "./student-status";

const DEADLINE = new Date("2026-10-10T23:59:00.000Z");
const at = (offsetMs: number) => new Date(DEADLINE.getTime() + offsetMs);
const HOUR = 3_600_000;

const facts = (overrides: Partial<AssignmentFacts> = {}): AssignmentFacts => ({
  type: "ASSIGNMENT",
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
function* everyCombination(): Generator<AssignmentFacts> {
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
  const decide = (operation: StudentOperation, overrides: Partial<AssignmentFacts>) => decideOperation(operation, facts(overrides));

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

// ── 013: EXERCISE (contracts/student-status.md, research K3, K4, K9) ─────────────────────────

const exerciseFacts = (overrides: Partial<ExerciseFacts> = {}): ExerciseFacts => ({
  type: "EXERCISE",
  activityStatus: "ACTIVE",
  classActive: true,
  latestAttempt: null,
  awaitingCorrection: false,
  now: at(-3 * 24 * HOUR),
  ...overrides,
});
const open = (number: number) => ({ latestAttempt: { number, status: "IN_PROGRESS" as const } });
const done = (number: number) => ({ latestAttempt: { number, status: "SUBMITTED" as const } });

/** No attempt, attempt 1 open, 1 concluded, 2 open (a retry), 2 and 3 concluded. */
const EXERCISE_ATTEMPTS = [{}, open(1), done(1), open(2), done(2), done(3)];

function* everyExerciseCombination(): Generator<ExerciseFacts> {
  for (const activityStatus of ["ACTIVE", "CLOSED"] as const)
    for (const classActive of [true, false])
      for (const awaitingCorrection of [true, false])
        for (const state of EXERCISE_ATTEMPTS) yield exerciseFacts({ activityStatus, classActive, awaitingCorrection, ...state });
}

describe("013/FR-014 situação do aluno no Exercício", () => {
  it("013/FR-014 PENDENTE → EM_ANDAMENTO → CONCLUÍDA; uma nova tentativa aberta continua CONCLUÍDA", () => {
    expect(deriveStudentStatus(exerciseFacts())).toBe("PENDING");
    expect(deriveStudentStatus(exerciseFacts(open(1)))).toBe("IN_PROGRESS");
    expect(deriveStudentStatus(exerciseFacts(done(1)))).toBe("COMPLETED");
    expect(deriveStudentStatus(exerciseFacts(open(2)))).toBe("COMPLETED");
    expect(deriveStudentStatus(exerciseFacts(done(3)))).toBe("COMPLETED");
  });

  it("013/FR-013 em todas as combinações: nunca ATRASADO, ENTREGUE ou CORRIGIDO, nunca urgente, nunca resultado de nota", () => {
    for (const combination of everyExerciseCombination()) {
      expect(["PENDING", "IN_PROGRESS", "COMPLETED"]).toContain(deriveStudentStatus(combination));
      expect(isUrgent(combination)).toBe(false);
      expect(isResultVisible(combination)).toBe(false);
    }
  });

  it("encerrada sem tentativa continua PENDENTE (não há prazo para atrasar)", () => {
    expect(deriveStudentStatus(exerciseFacts({ activityStatus: "CLOSED" }))).toBe("PENDING");
  });
});

describe("013/FR-016 situação na lista do professor (Exercício)", () => {
  it("não iniciou, em andamento, concluiu; nunca MISSED nem entregue", () => {
    expect(deriveRosterStatus(exerciseFacts())).toBe("NOT_STARTED");
    expect(deriveRosterStatus(exerciseFacts(open(1)))).toBe("IN_PROGRESS");
    expect(deriveRosterStatus(exerciseFacts(done(1)))).toBe("COMPLETED");
    expect(deriveRosterStatus(exerciseFacts(open(2)))).toBe("COMPLETED");
    for (const combination of everyExerciseCombination()) {
      expect(["NOT_STARTED", "IN_PROGRESS", "COMPLETED"]).toContain(deriveRosterStatus(combination));
    }
  });
});

describe("013/FR-005 013/FR-007 o que o aluno pode fazer no Exercício (research K4, K5)", () => {
  const decide = (operation: StudentOperation, overrides: Partial<ExerciseFacts>, target?: number) =>
    decideOperation(operation, exerciseFacts(overrides), target);

  it("sem tentativa: iniciar; refazer, salvar e concluir → NOT_STARTED", () => {
    expect(decide("START", {})).toEqual({ kind: "ALLOWED" });
    expect(decide("RETRY", {}, 1)).toEqual({ kind: "REFUSED", code: "NOT_STARTED" });
    expect(decide("SAVE", {})).toEqual({ kind: "REFUSED", code: "NOT_STARTED" });
    expect(decide("COMPLETE", {}, 1)).toEqual({ kind: "REFUSED", code: "NOT_STARTED" });
  });

  it("tentativa n aberta: iniciar repete; salvar e concluir n; refazer → ATTEMPT_NOT_COMPLETED", () => {
    expect(decide("START", open(1))).toEqual({ kind: "REPEAT" });
    expect(decide("SAVE", open(1))).toEqual({ kind: "ALLOWED" });
    expect(decide("COMPLETE", open(1), 1)).toEqual({ kind: "ALLOWED" });
    expect(decide("COMPLETE", open(2), 3)).toEqual({ kind: "REFUSED", code: "NOT_STARTED" });
    expect(decide("RETRY", open(1), 1)).toEqual({ kind: "REFUSED", code: "ATTEMPT_NOT_COMPLETED" });
  });

  it("013/FR-005 refazer depois da última concluída cria a próxima; repetir o pedido devolve a mesma (K4)", () => {
    expect(decide("RETRY", done(1), 1)).toEqual({ kind: "ALLOWED" });
    expect(decide("RETRY", open(2), 1)).toEqual({ kind: "REPEAT" });
    expect(decide("RETRY", done(2), 1)).toEqual({ kind: "REFUSED", code: "NOT_LATEST_ATTEMPT" });
    expect(decide("RETRY", done(2), 3)).toEqual({ kind: "REFUSED", code: "NOT_LATEST_ATTEMPT" });
    expect(decide("RETRY", open(3), 1)).toEqual({ kind: "REFUSED", code: "ATTEMPT_NOT_COMPLETED" });
  });

  it("013/FR-007 concluir uma tentativa já concluída é repetição idempotente, mesmo encerrada ou com a turma inativa", () => {
    expect(decide("COMPLETE", done(1), 1)).toEqual({ kind: "REPEAT" });
    expect(decide("COMPLETE", open(2), 1)).toEqual({ kind: "REPEAT" });
    expect(decide("COMPLETE", { ...done(2), activityStatus: "CLOSED" }, 2)).toEqual({ kind: "REPEAT" });
    expect(decide("COMPLETE", { ...done(2), classActive: false }, 1)).toEqual({ kind: "REPEAT" });
    expect(decide("SAVE", done(1))).toEqual({ kind: "REFUSED", code: "ATTEMPT_ALREADY_SUBMITTED" });
  });

  it("encerrada recusa com ACTIVITY_CLOSED e turma inativa com CLASS_NOT_ACTIVE; nunca DEADLINE_PASSED", () => {
    for (const operation of ["SAVE", "RETRY"] as const) {
      expect(decide(operation, { ...done(1), activityStatus: "CLOSED" }, 1)).toEqual({ kind: "REFUSED", code: "ACTIVITY_CLOSED" });
      expect(decide(operation, { ...done(1), classActive: false }, 1)).toEqual({ kind: "REFUSED", code: "CLASS_NOT_ACTIVE" });
    }
    expect(decide("START", { activityStatus: "CLOSED" })).toEqual({ kind: "REFUSED", code: "ACTIVITY_CLOSED" });
    for (const combination of everyExerciseCombination()) {
      for (const operation of ["START", "SAVE", "RETRY", "COMPLETE"] as const) {
        for (const target of [1, 2, 3]) {
          const outcome = decideOperation(operation, combination, target);
          if (outcome.kind === "REFUSED") expect(outcome.code).not.toBe("DEADLINE_PASSED");
        }
      }
    }
  });

  it("entregar é do Trabalho e refazer/concluir são do Exercício: o outro tipo recusa", () => {
    expect(decide("SUBMIT", open(1))).toEqual({ kind: "REFUSED", code: "INVALID_STATE_TRANSITION" });
    expect(decideOperation("RETRY", facts(submitted()), 1)).toEqual({ kind: "REFUSED", code: "INVALID_STATE_TRANSITION" });
    expect(decideOperation("COMPLETE", facts(inProgress), 1)).toEqual({ kind: "REFUSED", code: "INVALID_STATE_TRANSITION" });
  });

  it("canAnswer: turma e atividade ativas, mesmo depois de concluir (Refazer)", () => {
    for (const combination of everyExerciseCombination()) {
      expect(canAnswer(combination)).toBe(combination.classActive && combination.activityStatus === "ACTIVE");
    }
  });
});
