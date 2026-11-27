import { describe, expect, it } from "vitest";
import * as contracts from "../src/index.js";
import {
  ActivityExamSchema,
  CreateActivityRequestSchema,
  CreateAssignmentRequestSchema,
  CreateExamActivityRequestSchema,
  ExamMonitorSchema,
  MobileExamListItemSchema,
  UpdateActivityRequestSchema,
} from "../src/index.js";

// 032 (contracts/http-api.md, research AP2, AP4): the period replaces the exam's start window and the work's late policy.

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;

const START = "2026-11-30T22:10:00.000Z";
const END = "2026-12-01T01:00:00.000Z";

const work = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: uuid(99),
  source: { type: "ASSIGNMENT", workId: uuid(5) },
  title: "Trabalho de POO",
  publishAt: null,
  acknowledgeOutOfScope: false,
  deadline: END,
  ...overrides,
});
const exam = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: uuid(99),
  source: { type: "EXAM", examId: uuid(9) },
  title: "Prova 1",
  publishAt: null,
  acknowledgeOutOfScope: false,
  durationMinutes: 60,
  deadline: END,
  ...overrides,
});

describe("032 contratos do período (contracts/http-api.md)", () => {
  it("032/FR-009 o trabalho exige o término e não aceita mais política de atraso (estrito)", () => {
    expect(accepts(CreateActivityRequestSchema, work())).toBe(true);
    expect(accepts(CreateAssignmentRequestSchema, work({ deadline: undefined }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, work({ deadline: undefined }))).toBe(false);
    for (const latePolicy of ["REJECT", "ACCEPT_MARKED"]) {
      expect(accepts(CreateActivityRequestSchema, work({ latePolicy })), latePolicy).toBe(false);
    }
  });

  it("032/FR-005 a prova exige o término e não aceita mais limite para iniciar (estrito)", () => {
    expect(accepts(CreateActivityRequestSchema, exam())).toBe(true);
    expect(accepts(CreateExamActivityRequestSchema, exam({ deadline: undefined }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, exam({ deadline: undefined }))).toBe(false);
    for (const startWindowMinutes of [0, 15]) {
      expect(accepts(CreateActivityRequestSchema, exam({ startWindowMinutes })), String(startWindowMinutes)).toBe(false);
    }
    expect(accepts(CreateActivityRequestSchema, exam({ latePolicy: "REJECT" }))).toBe(false);
    expect(CreateExamActivityRequestSchema.parse(exam())).not.toHaveProperty("startWindowMinutes");
  });

  it("032/FR-002 com início agendado, o término vem depois dele nos dois tipos; na prova, deixa ao menos a duração", () => {
    expect(accepts(CreateActivityRequestSchema, work({ publishAt: START }))).toBe(true);
    expect(accepts(CreateActivityRequestSchema, work({ publishAt: END }))).toBe(false);
    expect(accepts(CreateActivityRequestSchema, work({ publishAt: "2026-12-01T02:00:00.000Z" }))).toBe(false);

    expect(accepts(CreateActivityRequestSchema, exam({ publishAt: START }))).toBe(true);
    expect(accepts(CreateActivityRequestSchema, exam({ publishAt: END }))).toBe(false);
    // 19:10 → 22:00 has 170 minutes: a 120-minute exam fits; 60 minutes before the end does not leave 61.
    expect(accepts(CreateActivityRequestSchema, exam({ publishAt: START, durationMinutes: 120 }))).toBe(true);
    expect(accepts(CreateActivityRequestSchema, exam({ publishAt: "2026-12-01T00:00:00.000Z", durationMinutes: 60 }))).toBe(true);
    expect(accepts(CreateActivityRequestSchema, exam({ publishAt: "2026-12-01T00:00:00.000Z", durationMinutes: 61 }))).toBe(false);
  });

  it("032/FR-012 a edição aceita o término e recusa a política de atraso", () => {
    expect(accepts(UpdateActivityRequestSchema, { version: 1, deadline: END })).toBe(true);
    expect(accepts(UpdateActivityRequestSchema, { version: 1, publishAt: START, deadline: END })).toBe(true);
    expect(accepts(UpdateActivityRequestSchema, { version: 1, publishAt: END, deadline: START })).toBe(false);
    expect(accepts(UpdateActivityRequestSchema, { version: 1, latePolicy: "REJECT" })).toBe(false);
  });

  it("032/FR-005 a visão da prova não tem mais o limite para iniciar; o início e o fechamento ficam (AP4)", () => {
    const timing = { durationMinutes: 60, inactivityLimitSeconds: 60, startDeadline: END, closesAt: END, pendingDecisions: 0 };
    expect(accepts(ActivityExamSchema, timing)).toBe(true);
    expect(accepts(ActivityExamSchema, { ...timing, startWindowMinutes: 15 })).toBe(false);
    expect(Object.keys(contracts).filter((name) => name.startsWith("EXAM_START_WINDOW"))).toEqual([]);
  });

  it("032/FR-008 o monitor e a lista do aplicativo instalado continuam com as mesmas chaves (AP4)", () => {
    expect(Object.keys(ExamMonitorSchema.shape).sort()).toEqual(["activityId", "closesAt", "durationMinutes", "serverNow", "startDeadline", "students"]);
    expect(Object.keys(MobileExamListItemSchema.shape).sort()).toEqual(["activityId", "classId", "className", "closesAt", "muted", "title"]);
  });
});
