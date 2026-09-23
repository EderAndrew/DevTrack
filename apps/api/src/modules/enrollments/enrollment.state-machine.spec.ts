import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { EnrollmentStateMachine } from "./enrollment.state-machine";

describe("EnrollmentStateMachine (003/FR-044)", () => {
  it("ACTIVE → REMOVED é permitido", () => {
    expect(EnrollmentStateMachine.canTransition("ACTIVE", "REMOVED")).toBe(true);
    expect(() => EnrollmentStateMachine.assertTransition("ACTIVE", "REMOVED")).not.toThrow();
  });

  it.each([
    ["ACTIVE", "ACTIVE"],
    ["REMOVED", "ACTIVE"],
    ["REMOVED", "REMOVED"],
  ] as const)("%s → %s é recusado com INVALID_STATE_TRANSITION", (from, to) => {
    expect(EnrollmentStateMachine.canTransition(from, to)).toBe(false);
    expect(() => EnrollmentStateMachine.assertTransition(from, to)).toThrow(
      new AppException("INVALID_STATE_TRANSITION"),
    );
  });
});
