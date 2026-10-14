import { describe, expect, it } from "vitest";
import {
  ClientIntegrityEventTypeSchema,
  INTEGRITY_EVENTS_MAX,
  IntegrityEventTypeSchema,
  IntegritySummarySchema,
  IntegrityTimelineSchema,
  RecordIntegrityEventsRequestSchema,
  RecordIntegrityEventsResultSchema,
  StudentIntegritySchema,
} from "../src/index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;
const AT = "2026-10-07T12:00:00.000Z";
const event = (n: number, overrides: Record<string, unknown> = {}) => ({
  eventId: uuid(n),
  type: "SCREEN_LEFT",
  clientOccurredAt: AT,
  buffered: false,
  ...overrides,
});
const totals = {
  screenExits: 2,
  timeAwaySeconds: 40,
  fullscreenExits: 1,
  disconnections: 0,
  offlineSeconds: 0,
  clipboardBlocks: 1,
  typingLimitRejections: 0,
  fullscreenUnavailable: false,
  detectionUnavailable: false,
};

describe("015 eventos do modo controlado (contracts/http-api.md, research F4)", () => {
  it("015/FR-009 têm exatamente os tipos do data-model, com queda e volta da conexão", () => {
    expect(IntegrityEventTypeSchema.options).toEqual([
      "SCREEN_LEFT",
      "SCREEN_RETURNED",
      "FULLSCREEN_EXITED",
      "FULLSCREEN_ENTERED",
      "PAGE_LEAVE_ATTEMPTED",
      "CONNECTION_LOST",
      "CONNECTION_RESTORED",
      "PASTE_BLOCKED",
      "COPY_BLOCKED",
      "CUT_BLOCKED",
      "DROP_BLOCKED",
      "TYPING_LIMIT_EXCEEDED",
      "FULLSCREEN_UNAVAILABLE",
      "DETECTION_UNAVAILABLE",
      // 018 adds the exam's inactivity.
      "INACTIVITY",
    ]);
  });

  it("015/FR-013c o limite de digitação é registrado só pelo servidor: o navegador não o envia", () => {
    expect(ClientIntegrityEventTypeSchema.options).not.toContain("TYPING_LIMIT_EXCEEDED");
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { type: "TYPING_LIMIT_EXCEEDED" })] })).toBe(false);
  });

  it("015/FR-010 um lote leva de 1 a 50 eventos com ids distintos", () => {
    expect(INTEGRITY_EVENTS_MAX).toBe(50);
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [] })).toBe(false);
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1)] })).toBe(true);
    const fifty = Array.from({ length: 50 }, (_, index) => event(index + 1));
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: fifty })).toBe(true);
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [...fifty, event(51)] })).toBe(false);
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1), event(1, { type: "SCREEN_RETURNED" })] })).toBe(false);
  });

  it("015/FR-013c a questão só acompanha um gesto de área de transferência bloqueado", () => {
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { type: "PASTE_BLOCKED", questionId: uuid(9) })] })).toBe(true);
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { type: "PASTE_BLOCKED" })] })).toBe(true);
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { questionId: uuid(9) })] })).toBe(false);
  });

  it("015/FR-010 campos do servidor e durações são recusados no corpo", () => {
    for (const field of ["recordedAt", "seconds", "durationSeconds", "attemptId", "studentUserId"]) {
      expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { [field]: field === "seconds" ? 3 : AT })] }), field).toBe(false);
    }
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1)], attemptId: uuid(2) })).toBe(false);
  });

  it("015/FR-024 015/FR-025 o resumo e a linha do tempo trazem só fatos, contagens e durações", () => {
    expect(accepts(IntegritySummarySchema, { studentUserId: uuid(1), attemptId: uuid(2), ...totals })).toBe(true);
    expect(accepts(IntegritySummarySchema, { studentUserId: uuid(1), attemptId: uuid(2), ...totals, suspicious: true })).toBe(false);
    const timeline = {
      events: [
        { type: "SCREEN_LEFT", questionPosition: null, recordedAt: AT, clientOccurredAt: null, buffered: false, occurrenceOrdinal: null, idleSeconds: null },
      ],
      intervals: [{ kind: "CONNECTION", from: AT, to: AT, seconds: 0, open: true }],
      totals,
      holds: [],
    };
    expect(accepts(IntegrityTimelineSchema, timeline)).toBe(true);
    expect(accepts(IntegrityTimelineSchema, { ...timeline, intervals: [{ ...timeline.intervals[0], kind: "TAB" }] })).toBe(false);
    expect(accepts(StudentIntegritySchema, { events: timeline.events, totals })).toBe(true);
  });
});

describe("018 ocorrências da prova nos eventos (contracts/http-api.md, research T6, T7)", () => {
  const view = (overrides: Record<string, unknown> = {}) => ({
    type: "INACTIVITY",
    questionPosition: null,
    recordedAt: AT,
    clientOccurredAt: null,
    buffered: false,
    occurrenceOrdinal: 1,
    idleSeconds: 60,
    ...overrides,
  });
  const hold = {
    id: uuid(7),
    attemptId: uuid(2),
    occurrenceOrdinal: 4,
    openedAt: AT,
    resolution: null,
    resolvedAt: null,
    canReturn: true,
  };

  it("018/FR-015 a inatividade vem do navegador com 30 a 60 s de ociosidade, e só ela leva esse campo", () => {
    expect(ClientIntegrityEventTypeSchema.options).toContain("INACTIVITY");
    for (const idleSeconds of [30, 45, 60]) {
      expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { type: "INACTIVITY", idleSeconds })] }), String(idleSeconds)).toBe(true);
    }
    for (const idleSeconds of [29, 61, 45.5, "60"]) {
      expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { type: "INACTIVITY", idleSeconds })] }), String(idleSeconds)).toBe(false);
    }
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { type: "INACTIVITY" })] })).toBe(false);
    expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { idleSeconds: 60 })] })).toBe(false);
  });

  it("018/FR-017 o lote devolve a contagem de ocorrências e a retenção da prova, null fora dela; o navegador não as envia", () => {
    const recorded = [{ eventId: uuid(1), recordedAt: AT }];
    expect(accepts(RecordIntegrityEventsResultSchema, { recorded, exam: null })).toBe(true);
    expect(accepts(RecordIntegrityEventsResultSchema, { recorded, exam: { occurrenceCount: 4, held: true } })).toBe(true);
    expect(accepts(RecordIntegrityEventsResultSchema, { recorded })).toBe(false);
    expect(accepts(RecordIntegrityEventsResultSchema, { recorded, exam: { occurrenceCount: -1, held: false } })).toBe(false);
    for (const field of ["occurrenceCount", "ordinal", "occurrenceOrdinal"]) {
      expect(accepts(RecordIntegrityEventsRequestSchema, { events: [event(1, { [field]: 1 })] }), field).toBe(false);
    }
  });

  it("018/FR-016 a linha do tempo traz o ordinal da ocorrência, a ociosidade e as retenções da tentativa", () => {
    const timeline = { events: [view(), view({ type: "SCREEN_RETURNED", occurrenceOrdinal: null, idleSeconds: null })], intervals: [], totals, holds: [hold] };
    expect(accepts(IntegrityTimelineSchema, timeline)).toBe(true);
    expect(accepts(IntegrityTimelineSchema, { ...timeline, holds: undefined })).toBe(false);
    expect(accepts(IntegrityTimelineSchema, { ...timeline, events: [view({ occurrenceOrdinal: 0 })] })).toBe(false);
    expect(accepts(IntegrityTimelineSchema, { ...timeline, holds: [{ ...hold, occurrenceOrdinal: 3 }] })).toBe(false);
    expect(accepts(StudentIntegritySchema, { events: timeline.events, totals })).toBe(true);
  });
});
