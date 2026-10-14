import type { IntegrityEventType } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { type CountState, countBatch, OCCURRENCE_GROUP_WINDOW_MS, occurrenceKindOf, opensHold, type StoredExamEvent } from "./exam-occurrences";

const at = (seconds: number, ms = 0) => new Date(Date.UTC(2026, 9, 12, 13, 0, seconds, ms));
let sequence = 0;
const live = (type: IntegrityEventType, recordedAt: Date): StoredExamEvent => ({ id: `e${++sequence}`, type, recordedAt, clientOccurredAt: null, buffered: false });
const buffered = (type: IntegrityEventType, clientOccurredAt: Date, recordedAt = at(50)): StoredExamEvent => ({
  id: `e${++sequence}`,
  type,
  recordedAt,
  clientOccurredAt,
  buffered: true,
});
const state = (overrides: Partial<CountState> = {}): CountState => ({
  lastOrdinal: 0,
  lastOccurrenceAt: null,
  lastHold: null,
  counting: true,
  endsAt: at(3600),
  ...overrides,
});

describe("018/FR-015 018/FR-017 contagem das ocorrências da prova (research T6)", () => {
  it("contam saída da tela, da tela cheia, as quatro tentativas de área de transferência e a inatividade; o resto é só fato", () => {
    expect(occurrenceKindOf("SCREEN_LEFT")).toBe("SCREEN_LEFT");
    expect(occurrenceKindOf("FULLSCREEN_EXITED")).toBe("FULLSCREEN_EXITED");
    for (const type of ["PASTE_BLOCKED", "COPY_BLOCKED", "CUT_BLOCKED", "DROP_BLOCKED"] as const) expect(occurrenceKindOf(type)).toBe("CLIPBOARD");
    expect(occurrenceKindOf("INACTIVITY")).toBe("INACTIVITY");
    for (const type of [
      "SCREEN_RETURNED",
      "FULLSCREEN_ENTERED",
      "PAGE_LEAVE_ATTEMPTED",
      "CONNECTION_LOST",
      "CONNECTION_RESTORED",
      "TYPING_LIMIT_EXCEEDED",
      "FULLSCREEN_UNAVAILABLE",
      "DETECTION_UNAVAILABLE",
    ] as const) {
      expect(occurrenceKindOf(type), type).toBeNull();
    }
  });

  it("novos ordinais a partir do último, um por evento contável", () => {
    const events = [live("SCREEN_LEFT", at(0)), live("SCREEN_RETURNED", at(1)), live("PASTE_BLOCKED", at(10))];
    expect(countBatch(events, state({ lastOrdinal: 1, lastOccurrenceAt: at(-30) }))).toEqual({
      occurrences: [
        { ordinal: 2, kind: "SCREEN_LEFT", firstEventId: events[0]!.id, recordedAt: at(0) },
        { ordinal: 3, kind: "CLIPBOARD", firstEventId: events[2]!.id, recordedAt: at(10) },
      ],
      holdAt: null,
    });
  });

  it("018/FR-017 saída da tela e da tela cheia juntas (2 s) contam uma; separadas, duas", () => {
    expect(OCCURRENCE_GROUP_WINDOW_MS).toBe(2000);
    const together = countBatch([live("SCREEN_LEFT", at(0)), live("FULLSCREEN_EXITED", at(1, 999))], state());
    expect(together.occurrences.map((occurrence) => occurrence.ordinal)).toEqual([1]);
    const apart = countBatch([live("SCREEN_LEFT", at(0)), live("FULLSCREEN_EXITED", at(2))], state());
    expect(apart.occurrences.map((occurrence) => occurrence.kind)).toEqual(["SCREEN_LEFT", "FULLSCREEN_EXITED"]);
    // The window runs from the latest occurrence of the attempt, also across batches.
    expect(countBatch([live("FULLSCREEN_EXITED", at(1))], state({ lastOrdinal: 1, lastOccurrenceAt: at(0) })).occurrences).toEqual([]);
  });

  it("num lote bufferizado (mesmo recordedAt), o agrupamento usa o horário do navegador, nunca como horário oficial", () => {
    const events = [buffered("SCREEN_LEFT", at(0)), buffered("FULLSCREEN_EXITED", at(1)), buffered("SCREEN_LEFT", at(30))];
    const result = countBatch(events, state());
    expect(result.occurrences.map((occurrence) => occurrence.firstEventId)).toEqual([events[0]!.id, events[2]!.id]);
    expect(result.occurrences.every((occurrence) => occurrence.recordedAt.getTime() === at(50).getTime())).toBe(true);
    // The first buffered event against an occurrence already stored compares the server's times.
    expect(countBatch([buffered("SCREEN_LEFT", at(0), at(51))], state({ lastOrdinal: 2, lastOccurrenceAt: at(50) })).occurrences).toEqual([]);
  });

  it("018/FR-018 a 4ª ocorrência abre a retenção e o resto do lote não conta", () => {
    const events = [live("SCREEN_LEFT", at(0)), live("PASTE_BLOCKED", at(10)), live("INACTIVITY", at(20))];
    expect(countBatch(events, state({ lastOrdinal: 3, lastOccurrenceAt: at(-30) }))).toEqual({
      occurrences: [{ ordinal: 4, kind: "SCREEN_LEFT", firstEventId: events[0]!.id, recordedAt: at(0) }],
      holdAt: 4,
    });
  });

  it("018/FR-018 depois de uma devolução, a próxima ocorrência abre outra retenção", () => {
    expect(opensHold(3, null)).toBe(false);
    expect(opensHold(4, null)).toBe(true);
    expect(opensHold(5, { occurrenceOrdinal: 4, resolution: "RETURNED" })).toBe(true);
    expect(opensHold(5, { occurrenceOrdinal: 4, resolution: null })).toBe(false);
    expect(opensHold(5, { occurrenceOrdinal: 4, resolution: "CANCEL_CONFIRMED" })).toBe(false);
    expect(opensHold(5, { occurrenceOrdinal: 4, resolution: "NOT_CANCELLED" })).toBe(false);
    const result = countBatch([live("SCREEN_LEFT", at(0))], state({ lastOrdinal: 4, lastOccurrenceAt: at(-60), lastHold: { occurrenceOrdinal: 4, resolution: "RETURNED" } }));
    expect(result).toMatchObject({ holdAt: 5, occurrences: [{ ordinal: 5 }] });
  });

  it("018/FR-020 nada conta pausado, retido, entregue ou a partir do fim", () => {
    const events = [live("SCREEN_LEFT", at(0))];
    expect(countBatch(events, state({ counting: false }))).toEqual({ occurrences: [], holdAt: null });
    expect(countBatch(events, state({ endsAt: at(0) }))).toEqual({ occurrences: [], holdAt: null });
    expect(countBatch([live("SCREEN_LEFT", at(0)), live("SCREEN_LEFT", at(10))], state({ endsAt: at(5) })).occurrences).toHaveLength(1);
  });
});
