import { TopicStatusSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { TopicStateMachine as machine } from "./topic.state-machine";

const ALL = TopicStatusSchema.options;
const ALLOWED = [
  ["DRAFT", "ACTIVE"],
  ["DRAFT", "ARCHIVED"],
  ["ACTIVE", "ARCHIVED"],
  ["ARCHIVED", "DRAFT"],
  ["ARCHIVED", "ACTIVE"],
] as const;
const isAllowed = (from: string, to: string) => ALLOWED.some(([f, t]) => f === from && t === to);

describe("TopicStateMachine (004/FR-038, 004/FR-039)", () => {
  it.each(ALLOWED)("004/FR-038 %s → %s é permitido", (from, to) => {
    expect(machine.canTransition(from, to)).toBe(true);
    expect(machine.transition(from, to)).toBe(true);
  });

  const refused = ALL.flatMap((from) =>
    ALL.filter((to) => to !== from && !isAllowed(from, to)).map((to) => [from, to] as const),
  );

  it.each(refused)("004/FR-038 %s → %s é recusado com INVALID_STATE_TRANSITION", (from, to) => {
    expect(machine.canTransition(from, to)).toBe(false);
    expect(() => machine.transition(from, to)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });

  it.each(ALL)("004/FR-038 repetir %s não tem efeito", (status) => {
    expect(machine.transition(status, status)).toBe(false);
  });

  it("004/FR-039 tópico novo nasce DRAFT no planejamento em rascunho e ACTIVE depois de confirmado", () => {
    expect(machine.initialStatus("DRAFT")).toBe("DRAFT");
    expect(machine.initialStatus("READY")).toBe("ACTIVE");
    expect(machine.initialStatus("ACTIVE")).toBe("ACTIVE");
  });

  it("004/FR-038 restaurar volta à situação anterior, ou ACTIVE com o planejamento confirmado", () => {
    expect(machine.restoredStatus("DRAFT", "DRAFT")).toBe("DRAFT");
    expect(machine.restoredStatus("ACTIVE", "DRAFT")).toBe("ACTIVE");
    expect(machine.restoredStatus(null, "DRAFT")).toBe("ACTIVE");
    expect(machine.restoredStatus("DRAFT", "READY")).toBe("ACTIVE");
    expect(machine.restoredStatus("DRAFT", "ACTIVE")).toBe("ACTIVE");
  });
});
