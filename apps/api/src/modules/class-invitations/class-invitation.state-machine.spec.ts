import { ClassInvitationStatusSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { ClassInvitationStateMachine } from "./class-invitation.state-machine";

const ALL = ClassInvitationStatusSchema.options;

describe("ClassInvitationStateMachine (003/FR-014)", () => {
  it.each([
    ["PENDING", "ACCEPTED"],
    ["PENDING", "CANCELLED"],
    ["PENDING", "EXPIRED"],
    ["PENDING", "PENDING"],
  ] as const)("%s → %s é permitido", (from, to) => {
    expect(ClassInvitationStateMachine.canTransition(from, to)).toBe(true);
    expect(() => ClassInvitationStateMachine.assertTransition(from, to)).not.toThrow();
  });

  it.each(["ACCEPTED", "EXPIRED", "CANCELLED"] as const)("%s é final: toda transição é recusada", (from) => {
    for (const to of ALL) {
      expect(ClassInvitationStateMachine.canTransition(from, to)).toBe(false);
      expect(() => ClassInvitationStateMachine.assertTransition(from, to)).toThrow(
        new AppException("INVALID_STATE_TRANSITION"),
      );
    }
  });
});
