import { describe, expect, it } from "vitest";
import { effectiveStatus } from "./effective-status";

describe("027/FR-023 situação efetiva da disciplina da turma (a mais restritiva)", () => {
  const cases = [
    ["ACTIVE", "ACTIVE", "ACTIVE"],
    ["ACTIVE", "INACTIVE", "INACTIVE"],
    ["ACTIVE", "ARCHIVED", "ARCHIVED"],
    ["INACTIVE", "ACTIVE", "INACTIVE"],
    ["INACTIVE", "INACTIVE", "INACTIVE"],
    ["INACTIVE", "ARCHIVED", "ARCHIVED"],
    ["ARCHIVED", "ACTIVE", "ARCHIVED"],
    ["ARCHIVED", "INACTIVE", "ARCHIVED"],
    ["ARCHIVED", "ARCHIVED", "ARCHIVED"],
  ] as const;

  it.each(cases)("turma %s + disciplina %s → %s", (cohort, own, expected) => {
    expect(effectiveStatus(cohort, own)).toBe(expected);
  });
});
