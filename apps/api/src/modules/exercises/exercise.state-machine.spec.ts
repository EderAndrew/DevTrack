import { ExerciseStatusSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { ExerciseStateMachine as machine } from "./exercise.state-machine";

const ALL = ExerciseStatusSchema.options;
const ALLOWED = [
  ["DRAFT", "APPROVED", null],
  ["DRAFT", "ARCHIVED", null],
  ["APPROVED", "ARCHIVED", null],
  ["ARCHIVED", "DRAFT", "DRAFT"],
  ["ARCHIVED", "APPROVED", "APPROVED"],
] as const;

describe("ExerciseStateMachine (010/FR-010, 010/FR-015)", () => {
  it.each(ALLOWED)("010/FR-010 %s → %s é permitido", (from, to, previous) => {
    expect(machine.canTransition(from, to, previous)).toBe(true);
    expect(machine.transition(from, to, previous)).toBe(true);
  });

  const refused = ALL.flatMap((from) =>
    ALL.filter((to) => to !== from && !ALLOWED.some(([f, t]) => f === from && t === to)).map((to) => [from, to] as const),
  );

  it.each(refused)("010/FR-010 %s → %s é recusado com INVALID_STATE_TRANSITION", (from, to) => {
    expect(machine.canTransition(from, to)).toBe(false);
    expect(() => machine.transition(from, to)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });

  it("010/FR-010 restaurar volta só à situação anterior ao arquivamento", () => {
    expect(machine.canTransition("ARCHIVED", "APPROVED", "DRAFT")).toBe(false);
    expect(machine.canTransition("ARCHIVED", "DRAFT", "APPROVED")).toBe(false);
    expect(machine.canTransition("ARCHIVED", "DRAFT", null)).toBe(false);
    expect(machine.restoredStatus("DRAFT")).toBe("DRAFT");
    expect(machine.restoredStatus("APPROVED")).toBe("APPROVED");
    expect(() => machine.restoredStatus(null)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });

  it.each(ALL)("010/FR-010 repetir %s não tem efeito", (status) => {
    expect(machine.transition(status, status)).toBe(false);
  });

  it("010/FR-015 arquivado não pode ser editado nem aprovado", () => {
    expect(machine.isEditable("ARCHIVED")).toBe(false);
    expect(machine.isEditable("DRAFT")).toBe(true);
    expect(machine.isEditable("APPROVED")).toBe(true);
    expect(() => machine.transition("ARCHIVED", "APPROVED", "DRAFT")).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });
});
