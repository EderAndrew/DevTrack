import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { ExamStateMachine } from "./exam.state-machine";

describe("018/FR-004 ciclo de vida da prova: rascunho, aprovada, arquivada", () => {
  it("rascunho → aprovada; rascunho ou aprovada → arquivada; arquivada → a situação de antes", () => {
    expect(ExamStateMachine.transition("DRAFT", "APPROVED")).toBe(true);
    expect(ExamStateMachine.transition("DRAFT", "ARCHIVED")).toBe(true);
    expect(ExamStateMachine.transition("APPROVED", "ARCHIVED")).toBe(true);
    expect(ExamStateMachine.transition("ARCHIVED", "APPROVED", "APPROVED")).toBe(true);
    expect(ExamStateMachine.restoredStatus("DRAFT")).toBe("DRAFT");
  });

  it("a mesma situação não muda nada; o resto é 409", () => {
    expect(ExamStateMachine.transition("APPROVED", "APPROVED")).toBe(false);
    expect(() => ExamStateMachine.transition("APPROVED", "DRAFT")).toThrow(new AppException("INVALID_STATE_TRANSITION"));
    expect(() => ExamStateMachine.transition("ARCHIVED", "APPROVED", "DRAFT")).toThrow(new AppException("INVALID_STATE_TRANSITION"));
    expect(() => ExamStateMachine.restoredStatus(null)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
    expect(() => ExamStateMachine.assertNotArchived("ARCHIVED")).toThrow(new AppException("EXAM_ARCHIVED"));
    expect(() => ExamStateMachine.assertNotArchived("APPROVED")).not.toThrow();
  });
});
