import { WorkStatusSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { WorkStateMachine as machine } from "./work.state-machine";

const ALL = WorkStatusSchema.options;
const ALLOWED = [
  ["DRAFT", "APPROVED", null],
  ["DRAFT", "ARCHIVED", null],
  ["APPROVED", "ARCHIVED", null],
  ["ARCHIVED", "DRAFT", "DRAFT"],
  ["ARCHIVED", "APPROVED", "APPROVED"],
] as const;

describe("WorkStateMachine (011/FR-013, 011/FR-016)", () => {
  it.each(ALLOWED)("011/FR-013 %s → %s é permitido", (from, to, previous) => {
    expect(machine.canTransition(from, to, previous)).toBe(true);
    expect(machine.transition(from, to, previous)).toBe(true);
  });

  const refused = ALL.flatMap((from) =>
    ALL.filter((to) => to !== from && !ALLOWED.some(([f, t]) => f === from && t === to)).map((to) => [from, to] as const),
  );

  it.each(refused)("011/FR-013 %s → %s é recusado com INVALID_STATE_TRANSITION", (from, to) => {
    expect(machine.canTransition(from, to)).toBe(false);
    expect(() => machine.transition(from, to)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });

  it("011/FR-016 restaurar volta só à situação anterior ao arquivamento", () => {
    expect(machine.canTransition("ARCHIVED", "APPROVED", "DRAFT")).toBe(false);
    expect(machine.canTransition("ARCHIVED", "DRAFT", "APPROVED")).toBe(false);
    expect(machine.canTransition("ARCHIVED", "DRAFT", null)).toBe(false);
    expect(machine.restoredStatus("DRAFT")).toBe("DRAFT");
    expect(machine.restoredStatus("APPROVED")).toBe("APPROVED");
    expect(() => machine.restoredStatus(null)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });

  it.each(ALL)("011/FR-013 repetir %s não tem efeito", (status) => {
    expect(machine.transition(status, status)).toBe(false);
  });

  it("011/FR-016 editar só em DRAFT e APPROVED; arquivado não pode ser editado nem aprovado", () => {
    expect(machine.isEditable("DRAFT")).toBe(true);
    expect(machine.isEditable("APPROVED")).toBe(true);
    expect(machine.isEditable("ARCHIVED")).toBe(false);
    expect(() => machine.assertEditable("ARCHIVED")).toThrow(new AppException("INVALID_STATE_TRANSITION"));
    expect(() => machine.transition("ARCHIVED", "APPROVED", "DRAFT")).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });
});
