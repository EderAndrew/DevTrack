import { describe, expect, it } from "vitest";
import { EXAM_WARNINGS, ExamHoldResolutionSchema, ExamMonitorSchema, ExamStatusOfStudentSchema, TeacherExamHoldSchema } from "../src/index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;
const AT = "2026-10-12T13:00:00.000Z";
const LATER = "2026-10-12T13:20:00.000Z";

const hold = (overrides: Record<string, unknown> = {}) => ({
  id: uuid(7),
  attemptId: uuid(2),
  occurrenceOrdinal: 4,
  openedAt: AT,
  resolution: null,
  resolvedAt: null,
  canReturn: true,
  ...overrides,
});

describe("018 retenção e decisão do professor (contracts/http-api.md, research T8, T9)", () => {
  it("018/FR-017 três avisos; a 4ª ocorrência abre a retenção", () => {
    expect(EXAM_WARNINGS).toBe(3);
    expect(accepts(TeacherExamHoldSchema, hold())).toBe(true);
    expect(accepts(TeacherExamHoldSchema, hold({ occurrenceOrdinal: 9 }))).toBe(true);
    expect(accepts(TeacherExamHoldSchema, hold({ occurrenceOrdinal: 3 }))).toBe(false);
  });

  it("018/FR-021 uma decisão por retenção: confirmar o cancelamento, devolver ou não cancelar", () => {
    expect(ExamHoldResolutionSchema.options).toEqual(["CANCEL_CONFIRMED", "RETURNED", "NOT_CANCELLED"]);
    for (const resolution of ExamHoldResolutionSchema.options) {
      expect(accepts(TeacherExamHoldSchema, hold({ resolution, resolvedAt: LATER, canReturn: false })), resolution).toBe(true);
    }
    expect(accepts(TeacherExamHoldSchema, hold({ resolution: "RETURNED", resolvedAt: null, canReturn: false }))).toBe(false);
    expect(accepts(TeacherExamHoldSchema, hold({ resolvedAt: LATER }))).toBe(false);
    expect(accepts(TeacherExamHoldSchema, hold({ resolution: "CANCELLED", resolvedAt: LATER, canReturn: false }))).toBe(false);
  });

  it("018/FR-022 devolver só numa retenção aberta: uma resolvida nunca pode ser devolvida", () => {
    expect(accepts(TeacherExamHoldSchema, hold({ canReturn: false }))).toBe(true);
    expect(accepts(TeacherExamHoldSchema, hold({ resolution: "NOT_CANCELLED", resolvedAt: LATER, canReturn: true }))).toBe(false);
  });

  it("018/FR-032 nenhum valor das retenções ou da situação do aluno fala em fraude, cola ou violação", () => {
    const values = [...ExamHoldResolutionSchema.options, ...ExamStatusOfStudentSchema.options];
    expect(values.filter((value) => /FRAUD|CHEAT|VIOLAT|COLA/.test(value))).toEqual([]);
  });
});

describe("018 acompanhamento da prova (contracts/http-api.md, research T12)", () => {
  const student = (overrides: Record<string, unknown> = {}) => ({
    studentUserId: uuid(3),
    name: "Ana",
    markedAt: AT,
    examStatus: "ANSWERING",
    attemptId: uuid(2),
    startedAt: AT,
    endsAt: LATER,
    occurrenceCount: 1,
    openHold: null,
    openPause: null,
    ...overrides,
  });
  const monitor = (students: unknown[]) => ({ activityId: uuid(1), durationMinutes: 20, startDeadline: AT, closesAt: LATER, serverNow: AT, students });

  it("018/FR-025 a situação de cada aluno é derivada: os valores do data-model", () => {
    expect(ExamStatusOfStudentSchema.options).toEqual([
      "NOT_MARKED",
      "PRESENT",
      "START_CLOSED",
      "ANSWERING",
      "PAUSED",
      "AWAITING_DECISION",
      "SUBMITTED",
      "TIME_EXPIRED",
      "ACTIVITY_CLOSED",
      "ENDED_BY_WARNINGS",
      "CANCELLED",
    ]);
  });

  it("018/FR-025 o monitor traz presença, tempos do servidor, ocorrências, retenção e pausa abertas", () => {
    const notMarked = student({ markedAt: null, examStatus: "NOT_MARKED", attemptId: null, startedAt: null, endsAt: null, occurrenceCount: 0 });
    const held = student({ examStatus: "AWAITING_DECISION", occurrenceCount: 4, openHold: hold() });
    const paused = student({
      examStatus: "PAUSED",
      openPause: { id: uuid(8), initiatedBy: "TEACHER", reason: "TEACHER", note: null, startedAt: AT, endedAt: null, endedBy: null, seconds: 30 },
    });
    expect(accepts(ExamMonitorSchema, monitor([held, paused, student(), notMarked]))).toBe(true);
    expect(accepts(ExamMonitorSchema, monitor([student({ occurrenceCount: -1 })]))).toBe(false);
    expect(accepts(ExamMonitorSchema, monitor([student({ examStatus: "FRAUD" })]))).toBe(false);
    expect(accepts(ExamMonitorSchema, { ...monitor([]), serverNow: undefined })).toBe(false);
    expect(accepts(ExamMonitorSchema, monitor([student({ answers: [] })]))).toBe(false);
  });
});
