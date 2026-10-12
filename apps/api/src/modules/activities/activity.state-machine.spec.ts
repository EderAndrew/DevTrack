import { ActivityStatusSchema, ActivityTypeSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { ACTIVITY_TYPES } from "./activity-types";
import { ActivityStateMachine } from "./activity.state-machine";

const STATUSES = ActivityStatusSchema.options;
const NOW = new Date("2026-10-05T12:00:00.000Z");

describe("012/FR-004 ciclo de vida da atividade da turma", () => {
  it("só ACTIVE → CLOSED, ACTIVE → CANCELLED e CLOSED → CANCELLED", () => {
    const allowed = STATUSES.flatMap((from) => STATUSES.filter((to) => ActivityStateMachine.canTransition(from, to)).map((to) => `${from}→${to}`));
    expect(allowed).toEqual(["ACTIVE→CLOSED", "ACTIVE→CANCELLED", "CLOSED→CANCELLED"]);
  });

  it("transição inválida → 409 INVALID_STATE_TRANSITION; repetir o estado atual é no-op", () => {
    expect(() => ActivityStateMachine.transition("CLOSED", "ACTIVE")).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
    expect(() => ActivityStateMachine.transition("CANCELLED", "CLOSED")).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
    expect(ActivityStateMachine.transition("CLOSED", "CLOSED")).toBe(false);
    expect(ActivityStateMachine.transition("ACTIVE", "CLOSED")).toBe(true);
  });

  it("agendada e publicada são fases da ativa pelo relógio do servidor; o aluno vê da publicação até o cancelamento", () => {
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    expect(ActivityStateMachine.phase("ACTIVE", tomorrow, NOW)).toBe("SCHEDULED");
    expect(ActivityStateMachine.phase("ACTIVE", NOW, NOW)).toBe("PUBLISHED");
    expect(ActivityStateMachine.phase("CLOSED", NOW, NOW)).toBeNull();
    expect(ActivityStateMachine.isVisibleToStudents("ACTIVE", tomorrow, NOW)).toBe(false);
    expect(ActivityStateMachine.isVisibleToStudents("ACTIVE", NOW, NOW)).toBe(true);
    expect(ActivityStateMachine.isVisibleToStudents("CLOSED", NOW, NOW)).toBe(true);
    expect(ActivityStateMachine.isVisibleToStudents("CANCELLED", NOW, NOW)).toBe(false);
  });

  it("só a atividade ativa é editável", () => {
    expect(() => ActivityStateMachine.assertEditable("ACTIVE")).not.toThrow();
    expect(() => ActivityStateMachine.assertEditable("CLOSED")).toThrow(expect.objectContaining({ code: "INVALID_STATE_TRANSITION" }));
  });

  it("012/FR-003 o registro de tipos tem Exercício e Trabalho, e a Prova desde a 018", () => {
    expect(Object.keys(ACTIVITY_TYPES).sort()).toEqual([...ActivityTypeSchema.options].sort());
    expect(Object.keys(ACTIVITY_TYPES)).toHaveLength(3);
  });

  it("018/FR-010 a Prova tem nota, uma tentativa, sem prazo nem opções do professor, só para os presentes", () => {
    expect(ACTIVITY_TYPES.EXAM).toEqual({ scoring: "GRADE", hasDeadline: false, attempts: "SINGLE", sourceCount: { min: 1, max: 1 }, workOptions: false, releaseMode: "PRESENT_ONLY" });
  });

  it("013/FR-001 015/FR-002 016/FR-007 Trabalho tem nota, prazo, uma tentativa e as opções da 015; Exercício tem pontos, sem prazo, com tentativas de prática e sem opções", () => {
    expect(ACTIVITY_TYPES.ASSIGNMENT).toEqual({ scoring: "GRADE", hasDeadline: true, attempts: "SINGLE", sourceCount: { min: 1, max: 1 }, workOptions: true, releaseMode: "PRESENT_ONLY" });
    expect(ACTIVITY_TYPES.EXERCISE).toEqual({ scoring: "POINTS", hasDeadline: false, attempts: "PRACTICE", sourceCount: { min: 1, max: 10 }, workOptions: false, releaseMode: "ALL_ENROLLED" });
  });
});
