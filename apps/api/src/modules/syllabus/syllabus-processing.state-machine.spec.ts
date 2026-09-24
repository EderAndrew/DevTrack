import { MAX_PROCESSING_ATTEMPTS, SyllabusProcessingStatusSchema } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { AppException } from "../../platform/http/errors";
import { SyllabusProcessingStateMachine as machine } from "./syllabus-processing.state-machine";

const ALL = SyllabusProcessingStatusSchema.options;
const ALLOWED = [
  ["UPLOADED", "PROCESSING"],
  ["PROCESSING", "PROCESSED"],
  ["PROCESSING", "UPLOADED"],
  ["PROCESSING", "FAILED"],
  ["PROCESSING", "PROCESSING"],
  ["FAILED", "UPLOADED"],
] as const;
const isAllowed = (from: string, to: string) => ALLOWED.some(([f, t]) => f === from && t === to);

describe("SyllabusProcessingStateMachine (004/FR-014, 004/FR-015)", () => {
  it.each(ALLOWED)("004/FR-014 %s → %s é permitido", (from, to) => {
    expect(machine.canTransition(from, to)).toBe(true);
    expect(() => machine.assertTransition(from, to)).not.toThrow();
  });

  const refused = ALL.flatMap((from) => ALL.filter((to) => !isAllowed(from, to)).map((to) => [from, to] as const));

  it.each(refused)("004/FR-014 %s → %s é recusado com INVALID_STATE_TRANSITION", (from, to) => {
    expect(machine.canTransition(from, to)).toBe(false);
    expect(() => machine.assertTransition(from, to)).toThrow(new AppException("INVALID_STATE_TRANSITION"));
  });

  it("PROCESSED é final", () => {
    expect(ALL.filter((to) => machine.canTransition("PROCESSED", to))).toEqual([]);
  });

  it("004/FR-015 arquivo ilegível falha na primeira tentativa", () => {
    expect(machine.afterFailure("UNREADABLE", 1)).toEqual({ to: "FAILED", retryInSeconds: null });
  });

  it.each(["TIMEOUT", "INTERNAL"] as const)(
    "004/FR-015 %s volta para a fila depois de 1 min e de 5 min, e falha na 3ª tentativa",
    (category) => {
      expect(machine.afterFailure(category, 1)).toEqual({ to: "UPLOADED", retryInSeconds: 60 });
      expect(machine.afterFailure(category, 2)).toEqual({ to: "UPLOADED", retryInSeconds: 300 });
      expect(machine.afterFailure(category, MAX_PROCESSING_ATTEMPTS)).toEqual({ to: "FAILED", retryInSeconds: null });
      expect(MAX_PROCESSING_ATTEMPTS).toBe(3);
    },
  );
});
