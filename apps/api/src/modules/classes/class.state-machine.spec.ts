import { ClassStatusSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { ClassStateMachine } from "./class.state-machine";

const ALL = ClassStatusSchema.options;
const ALLOWED = [
  ["ACTIVE", "INACTIVE"],
  ["INACTIVE", "ACTIVE"],
  ["ACTIVE", "ARCHIVED"],
  ["INACTIVE", "ARCHIVED"],
] as const;
const isAllowed = (from: string, to: string) => ALLOWED.some(([f, t]) => f === from && t === to);

describe("ClassStateMachine (003/FR-004)", () => {
  it.each(ALLOWED)("%s → %s é permitido", (from, to) => {
    expect(ClassStateMachine.canTransition(from, to)).toBe(true);
    expect(() => ClassStateMachine.assertTransition(from, to)).not.toThrow();
  });

  const refused = ALL.flatMap((from) => ALL.filter((to) => !isAllowed(from, to)).map((to) => [from, to] as const));

  it.each(refused)("%s → %s é recusado com INVALID_STATE_TRANSITION", (from, to) => {
    expect(ClassStateMachine.canTransition(from, to)).toBe(false);
    expect(() => ClassStateMachine.assertTransition(from, to)).toThrow(
      new AppException("INVALID_STATE_TRANSITION"),
    );
  });

  it("ARCHIVED é final", () => {
    expect(ALL.filter((to) => ClassStateMachine.canTransition("ARCHIVED", to))).toEqual([]);
  });
});
