import { describe, expect, it } from "vitest";
import type { InvitationStatus } from "../../generated/prisma/client";
import { AppException } from "../../platform/http/errors";
import { InvitationStateMachine } from "./invitation.state-machine";

const ALL: InvitationStatus[] = ["PENDING", "ACCEPTED", "EXPIRED", "REVOKED"];

describe("InvitationStateMachine (data-model.md, FR-041)", () => {
  it.each([
    ["PENDING", "ACCEPTED"],
    ["PENDING", "REVOKED"],
    ["PENDING", "EXPIRED"],
    ["PENDING", "PENDING"],
  ] as const)("%s → %s é permitido", (from, to) => {
    expect(InvitationStateMachine.canTransition(from, to)).toBe(true);
    expect(() => InvitationStateMachine.assertTransition(from, to)).not.toThrow();
  });

  it.each(["ACCEPTED", "EXPIRED", "REVOKED"] as const)("%s é terminal", (from) => {
    for (const to of ALL) {
      expect(InvitationStateMachine.canTransition(from, to)).toBe(false);
      try {
        InvitationStateMachine.assertTransition(from, to);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).code).toBe("INVALID_STATE_TRANSITION");
      }
    }
  });
});
