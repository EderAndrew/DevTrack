import { AI_FINAL_EXECUTION_STATUSES, AiExecutionStatusSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { AppException } from "../../../platform/http/errors";
import { AiExecutionStateMachine } from "./ai-execution.state-machine";

const ALL = AiExecutionStatusSchema.options;
const ALLOWED = [
  ["QUEUED", "RUNNING"],
  ["QUEUED", "CANCELLED"],
  ["QUEUED", "TIMED_OUT"],
  ["RUNNING", "WAITING_TOOL"],
  ["RUNNING", "VALIDATING_OUTPUT"],
  ["RUNNING", "FAILED"],
  ["RUNNING", "CANCELLED"],
  ["RUNNING", "TIMED_OUT"],
  ["WAITING_TOOL", "RUNNING"],
  ["WAITING_TOOL", "FAILED"],
  ["WAITING_TOOL", "CANCELLED"],
  ["WAITING_TOOL", "TIMED_OUT"],
  ["VALIDATING_OUTPUT", "COMPLETED"],
  ["VALIDATING_OUTPUT", "FAILED"],
  ["VALIDATING_OUTPUT", "CANCELLED"],
  ["VALIDATING_OUTPUT", "TIMED_OUT"],
] as const;
const isAllowed = (from: string, to: string) => ALLOWED.some(([f, t]) => f === from && t === to);

describe("006/FR-021 AiExecutionStateMachine", () => {
  it.each(ALLOWED)("%s → %s é permitido", (from, to) => {
    expect(AiExecutionStateMachine.canTransition(from, to)).toBe(true);
    expect(() => AiExecutionStateMachine.assertTransition(from, to)).not.toThrow();
  });

  const refused = ALL.flatMap((from) => ALL.filter((to) => !isAllowed(from, to)).map((to) => [from, to] as const));

  it.each(refused)("%s → %s é recusado com INVALID_STATE_TRANSITION", (from, to) => {
    expect(AiExecutionStateMachine.canTransition(from, to)).toBe(false);
    expect(() => AiExecutionStateMachine.assertTransition(from, to)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });

  it.each(AI_FINAL_EXECUTION_STATUSES)("%s é final", (status) => {
    expect(AiExecutionStateMachine.isFinal(status)).toBe(true);
    expect(ALL.filter((to) => AiExecutionStateMachine.canTransition(status, to))).toEqual([]);
  });

  it("os estados não finais podem terminar cancelados e por tempo esgotado", () => {
    for (const status of ALL.filter((s) => !AiExecutionStateMachine.isFinal(s))) {
      expect(AiExecutionStateMachine.canTransition(status, "CANCELLED"), status).toBe(true);
      expect(AiExecutionStateMachine.canTransition(status, "TIMED_OUT"), status).toBe(true);
    }
  });
});
