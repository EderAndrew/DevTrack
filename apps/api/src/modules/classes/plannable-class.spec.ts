import { describe, expect, it } from "vitest";
import type { SchoolClass } from "../../generated/prisma/client";
import { AppException } from "../../platform/http/errors";
import { requirePlannable } from "./plannable-class";

const BASE = {
  id: "c1",
  teacherId: "t1",
  status: "ACTIVE",
  subjectId: "s1",
  startsOn: new Date("2027-02-01T00:00:00Z"),
  endsOn: new Date("2027-06-30T00:00:00Z"),
} as SchoolClass;

describe("requirePlannable (004 data-model, US1-4)", () => {
  it("turma com disciplina e as duas datas é planejável", () => {
    expect(requirePlannable(BASE)).toBe(BASE);
    expect(requirePlannable(BASE, "write")).toBe(BASE);
  });

  it.each([
    ["sem disciplina", { subjectId: null }],
    ["sem datas", { startsOn: null, endsOn: null }],
  ])("%s → 422 CLASS_NOT_PLANNABLE", (_label, change) => {
    const schoolClass = { ...BASE, ...change } as SchoolClass;
    expect(() => requirePlannable(schoolClass)).toThrow(new AppException("CLASS_NOT_PLANNABLE"));
    expect(() => requirePlannable(schoolClass, "write")).toThrow(new AppException("CLASS_NOT_PLANNABLE"));
  });

  it("turma arquivada: leitura continua, escrita → 409 PLAN_ARCHIVED", () => {
    const archived = { ...BASE, status: "ARCHIVED" } as SchoolClass;
    expect(requirePlannable(archived)).toBe(archived);
    expect(() => requirePlannable(archived, "write")).toThrow(new AppException("PLAN_ARCHIVED"));
    expect(() => requirePlannable({ ...archived, subjectId: null }, "write")).toThrow(new AppException("PLAN_ARCHIVED"));
  });
});
