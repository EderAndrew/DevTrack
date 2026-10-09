import type { IntegrityEventType } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { buildTimeline, occurredAt, type TimelineEvent } from "./timeline";

const START = new Date("2026-10-01T12:00:00.000Z").getTime();
const at = (seconds: number) => new Date(START + seconds * 1_000);

/** A server-timed event at `seconds`; buffered events carry the browser's time. */
const event = (type: IntegrityEventType, seconds: number, overrides: Partial<TimelineEvent> = {}): TimelineEvent => ({
  type,
  questionId: null,
  recordedAt: at(seconds),
  clientOccurredAt: null,
  buffered: false,
  ...overrides,
});
const buffered = (type: IntegrityEventType, browserSeconds: number, receivedSeconds: number): TimelineEvent =>
  event(type, receivedSeconds, { buffered: true, clientOccurredAt: at(browserSeconds) });
const span = (kind: string, from: number, to: number, open = false) => ({ kind, from: at(from), to: at(to), seconds: to - from, open });

describe("015/FR-013c 015/FR-024 linha do tempo derivada dos eventos (research F4)", () => {
  it("pares saída → retorno de tela, tela cheia e conexão, com os totais", () => {
    const timeline = buildTimeline(
      [
        event("SCREEN_LEFT", 10),
        event("SCREEN_RETURNED", 40),
        event("FULLSCREEN_EXITED", 50),
        event("FULLSCREEN_ENTERED", 55),
        event("SCREEN_LEFT", 100),
        event("SCREEN_RETURNED", 101),
        event("PASTE_BLOCKED", 120, { questionId: "q1" }),
        event("COPY_BLOCKED", 121, { questionId: "q1" }),
        event("TYPING_LIMIT_EXCEEDED", 130, { questionId: "q2" }),
      ],
      at(600),
    );
    expect(timeline.intervals).toEqual([span("SCREEN", 10, 40), span("FULLSCREEN", 50, 55), span("SCREEN", 100, 101)]);
    expect(timeline.totals).toEqual({
      screenExits: 2,
      timeAwaySeconds: 31,
      fullscreenExits: 1,
      disconnections: 0,
      offlineSeconds: 0,
      clipboardBlocks: 2,
      typingLimitRejections: 1,
      fullscreenUnavailable: false,
      detectionUnavailable: false,
    });
  });

  it("uma saída sem retorno termina no próximo evento da tentativa, aberta", () => {
    const timeline = buildTimeline([event("SCREEN_LEFT", 10), event("PASTE_BLOCKED", 70, { questionId: "q1" })], at(600));
    expect(timeline.intervals).toEqual([span("SCREEN", 10, 70, true)]);
  });

  it("uma saída sem retorno e sem evento depois termina na entrega (ou agora)", () => {
    expect(buildTimeline([event("FULLSCREEN_EXITED", 10)], at(300)).intervals).toEqual([span("FULLSCREEN", 10, 300, true)]);
  });

  it("uma segunda saída do mesmo tipo fecha a primeira, aberta, e começa outra", () => {
    const timeline = buildTimeline([event("SCREEN_LEFT", 10), event("SCREEN_LEFT", 20), event("SCREEN_RETURNED", 25)], at(600));
    expect(timeline.intervals).toEqual([span("SCREEN", 10, 20, true), span("SCREEN", 20, 25)]);
    expect(timeline.totals.screenExits).toBe(2);
  });

  it("um retorno sem saída não cria intervalo; tipos diferentes não se fecham entre si", () => {
    const timeline = buildTimeline(
      [event("SCREEN_RETURNED", 5), event("SCREEN_LEFT", 10), event("FULLSCREEN_EXITED", 11), event("FULLSCREEN_ENTERED", 30), event("SCREEN_RETURNED", 31)],
      at(600),
    );
    expect(timeline.intervals).toEqual([span("SCREEN", 10, 31), span("FULLSCREEN", 11, 30)]);
  });

  it("015/US2-8 eventos bufferizados contam pelo horário do navegador e entram na ordem em que aconteceram", () => {
    const timeline = buildTimeline(
      [
        event("CONNECTION_RESTORED", 90),
        buffered("SCREEN_RETURNED", 60, 90),
        buffered("CONNECTION_LOST", 20, 90),
        buffered("SCREEN_LEFT", 30, 90),
      ],
      at(600),
    );
    expect(timeline.events.map((item) => item.type)).toEqual(["CONNECTION_LOST", "SCREEN_LEFT", "SCREEN_RETURNED", "CONNECTION_RESTORED"]);
    expect(timeline.intervals).toEqual([span("CONNECTION", 20, 90), span("SCREEN", 30, 60)]);
    expect(timeline.totals).toMatchObject({ disconnections: 1, offlineSeconds: 70, screenExits: 1, timeAwaySeconds: 30 });
  });

  it("o horário do navegador nunca passa do horário em que o servidor recebeu o evento", () => {
    expect(occurredAt(buffered("SCREEN_LEFT", 500, 100))).toEqual(at(100));
    expect(occurredAt(buffered("SCREEN_LEFT", 50, 100))).toEqual(at(50));
    expect(occurredAt(event("SCREEN_LEFT", 100, { clientOccurredAt: at(10) }))).toEqual(at(100));
  });

  it("durações em segundos inteiros; tela cheia e detecção indisponíveis viram indicadores", () => {
    const timeline = buildTimeline(
      [
        event("FULLSCREEN_UNAVAILABLE", 0),
        event("DETECTION_UNAVAILABLE", 0),
        event("SCREEN_LEFT", 1, { recordedAt: new Date(START + 1_000) }),
        event("SCREEN_RETURNED", 2, { recordedAt: new Date(START + 2_999) }),
      ],
      at(600),
    );
    expect(timeline.intervals[0]!.seconds).toBe(1);
    expect(timeline.totals).toMatchObject({ fullscreenUnavailable: true, detectionUnavailable: true, screenExits: 1 });
  });

  it("sem eventos, tudo zero", () => {
    expect(buildTimeline([], at(10))).toEqual({
      events: [],
      intervals: [],
      totals: {
        screenExits: 0,
        timeAwaySeconds: 0,
        fullscreenExits: 0,
        disconnections: 0,
        offlineSeconds: 0,
        clipboardBlocks: 0,
        typingLimitRejections: 0,
        fullscreenUnavailable: false,
        detectionUnavailable: false,
      },
    });
  });
});
