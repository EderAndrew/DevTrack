import { describe, expect, it } from "vitest";
import type { RoleAssignmentStatus } from "../../generated/prisma/client";
import { AppException } from "../../platform/http/errors";
import { RoleAssignmentStateMachine } from "./role-assignment.state-machine";

const STATUSES: RoleAssignmentStatus[] = ["ACTIVE", "SUSPENDED", "INACTIVE"];
const VALID = new Set(["ACTIVE→SUSPENDED", "SUSPENDED→ACTIVE", "ACTIVE→INACTIVE", "SUSPENDED→INACTIVE", "INACTIVE→ACTIVE"]);

describe("RoleAssignmentStateMachine", () => {
  const pairs = STATUSES.flatMap((from) => STATUSES.map((to) => [from, to] as const));

  it.each(pairs)("%s → %s", (from, to) => {
    const valid = VALID.has(`${from}→${to}`);
    expect(RoleAssignmentStateMachine.canTransition(from, to)).toBe(valid);
    if (valid) {
      expect(() => RoleAssignmentStateMachine.assertTransition(from, to)).not.toThrow();
    } else {
      try {
        RoleAssignmentStateMachine.assertTransition(from, to);
        expect.unreachable();
      } catch (error) {
        expect((error as AppException).toBody()).toMatchObject({ statusCode: 409, code: "INVALID_STATE_TRANSITION" });
      }
    }
  });
});
