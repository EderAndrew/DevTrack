import { describe, expect, it } from "vitest";
import {
  ActivityGradingStatusSchema,
  ActivityStatusSchema,
  ActivityTypeSchema,
  AttemptStatusSchema,
  ExecutionModeSchema,
  LatePolicySchema,
  PublicationPhaseSchema,
  RosterStatusSchema,
  StudentActivityFilterSchema,
  StudentActivityStatusSchema,
} from "../src/index.js";

describe("012 enums das atividades da turma e do portal do aluno", () => {
  it("têm exatamente os valores do data-model", () => {
    expect(ActivityTypeSchema.options).toEqual(["EXERCISE", "ASSIGNMENT"]);
    expect(ExecutionModeSchema.options).toEqual(["NORMAL"]);
    expect(ActivityStatusSchema.options).toEqual(["ACTIVE", "CLOSED", "CANCELLED"]);
    expect(PublicationPhaseSchema.options).toEqual(["SCHEDULED", "PUBLISHED"]);
    expect(LatePolicySchema.options).toEqual(["REJECT", "ACCEPT_MARKED"]);
    expect(StudentActivityStatusSchema.options).toEqual(["PENDING", "IN_PROGRESS", "OVERDUE", "SUBMITTED", "GRADED"]);
    expect(StudentActivityFilterSchema.options).toEqual(["PENDING", "IN_PROGRESS", "OVERDUE", "COMPLETED"]);
    expect(RosterStatusSchema.options).toEqual(["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "SUBMITTED_LATE", "MISSED"]);
    expect(AttemptStatusSchema.options).toEqual(["IN_PROGRESS", "SUBMITTED"]);
    expect(ActivityGradingStatusSchema.options).toEqual(["GRADED", "PENDING_TEACHER", "DECIDED"]);
  });

  it("012/FR-003 prova e modo controlado ficam reservados: nenhum enum os aceita", () => {
    for (const value of ["EXAM", "PROVA", "QUIZ"]) expect(ActivityTypeSchema.safeParse(value).success, value).toBe(false);
    for (const value of ["CONTROLLED", "CONTROLADO"]) expect(ExecutionModeSchema.safeParse(value).success, value).toBe(false);
  });

  it("012/SC-012 nenhum enum da 012 tem valor de prova ou de modo controlado", () => {
    const schemas = [
      ActivityTypeSchema,
      ExecutionModeSchema,
      ActivityStatusSchema,
      PublicationPhaseSchema,
      LatePolicySchema,
      StudentActivityStatusSchema,
      StudentActivityFilterSchema,
      RosterStatusSchema,
      AttemptStatusSchema,
      ActivityGradingStatusSchema,
    ];
    const values = schemas.flatMap((schema) => schema.options.map(String));
    expect(values.filter((value) => /EXAM|PROVA|CONTROL/.test(value))).toEqual([]);
  });
});
