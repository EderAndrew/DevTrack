import { ClassPlanStatusSchema, PlanStatusActionSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { ClassPlanStateMachine as machine } from "./class-plan.state-machine";

const ALL = ClassPlanStatusSchema.options;
const ALLOWED = [
  ["DRAFT", "READY"],
  ["READY", "DRAFT"],
  ["READY", "ACTIVE"],
  ["DRAFT", "ARCHIVED"],
  ["READY", "ARCHIVED"],
  ["ACTIVE", "ARCHIVED"],
] as const;
const isAllowed = (from: string, to: string) => ALLOWED.some(([f, t]) => f === from && t === to);

describe("ClassPlanStateMachine (004/FR-031, 004/FR-039)", () => {
  it.each(ALLOWED)("004/FR-039 %s → %s é permitido", (from, to) => {
    expect(machine.canTransition(from, to)).toBe(true);
  });

  const refused = ALL.flatMap((from) => ALL.filter((to) => !isAllowed(from, to)).map((to) => [from, to] as const));

  it.each(refused)("004/FR-039 %s → %s é recusado", (from, to) => {
    expect(machine.canTransition(from, to)).toBe(false);
  });

  it.each([
    ["DRAFT", "CONFIRM", "READY"],
    ["READY", "REOPEN", "DRAFT"],
    ["READY", "START", "ACTIVE"],
    ["DRAFT", "ARCHIVE", "ARCHIVED"],
    ["READY", "ARCHIVE", "ARCHIVED"],
    ["ACTIVE", "ARCHIVE", "ARCHIVED"],
  ] as const)("004/FR-031 %s + %s → %s", (from, action, to) => {
    expect(machine.apply(from, action)).toBe(to);
  });

  it.each([
    ["READY", "CONFIRM"],
    ["DRAFT", "REOPEN"],
    ["ACTIVE", "START"],
    ["ARCHIVED", "ARCHIVE"],
  ] as const)("004/FR-039 repetir %s + %s não tem efeito", (from, action) => {
    expect(machine.apply(from, action)).toBeNull();
  });

  it.each([
    ["DRAFT", "START"],
    ["ACTIVE", "CONFIRM"],
    ["ACTIVE", "REOPEN"],
    ["ARCHIVED", "CONFIRM"],
    ["ARCHIVED", "REOPEN"],
    ["ARCHIVED", "START"],
  ] as const)("004/FR-039 %s + %s → 409 INVALID_STATE_TRANSITION", (from, action) => {
    expect(() => machine.apply(from, action)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });

  it("ARCHIVED é final para toda ação", () => {
    for (const action of PlanStatusActionSchema.options) {
      if (action === "ARCHIVE") continue;
      expect(() => machine.apply("ARCHIVED", action), action).toThrow(AppException);
    }
    expect(ALL.filter((to) => machine.canTransition("ARCHIVED", to))).toEqual([]);
  });
});
