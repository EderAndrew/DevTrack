import { AiProposalStatusSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { AppException } from "../../../platform/http/errors";
import { AiProposalStateMachine } from "./ai-proposal.state-machine";

const ALL = AiProposalStatusSchema.options;
const DECIDED = ["APPROVED", "PARTIALLY_APPROVED", "REJECTED", "EXPIRED"] as const;

describe("006/FR-042 AiProposalStateMachine", () => {
  it.each(DECIDED)("READY_FOR_REVIEW → %s é permitido", (to) => {
    expect(AiProposalStateMachine.canTransition("READY_FOR_REVIEW", to)).toBe(true);
  });

  it.each(DECIDED)("%s é final", (from) => {
    for (const to of ALL) {
      expect(AiProposalStateMachine.canTransition(from, to), `${from} → ${to}`).toBe(false);
      expect(() => AiProposalStateMachine.assertTransition(from, to)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
    }
  });

  it("READY_FOR_REVIEW → READY_FOR_REVIEW não é transição", () => {
    expect(AiProposalStateMachine.canTransition("READY_FOR_REVIEW", "READY_FOR_REVIEW")).toBe(false);
  });
});
