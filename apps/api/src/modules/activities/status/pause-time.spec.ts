import { describe, expect, it } from "vitest";
import { pauseTime, secondsAway } from "./pause-time";

const at = (minutes: number, seconds = 0) => new Date(Date.UTC(2026, 9, 9, 13, minutes, seconds));
const none = { acceptedAt: null, activityEndedAt: null };

describe("016/FR-019 016/FR-021 fim e duração de uma pausa, derivados na leitura (research M7)", () => {
  it("aberta: sem fim, contada até agora", () => {
    expect(pauseTime({ startedAt: at(0), releasedAt: null }, none, at(4, 30))).toEqual({ endedAt: null, endedBy: null, seconds: 270 });
  });

  it("016/FR-014 liberada pelo professor: termina no retorno, e o agora não conta mais", () => {
    const pause = { startedAt: at(0), releasedAt: at(3) };
    expect(pauseTime(pause, none, at(50))).toEqual({ endedAt: at(3), endedBy: "RELEASE", seconds: 180 });
    expect(pauseTime(pause, { acceptedAt: at(10), activityEndedAt: at(20) }, at(50)).endedBy).toBe("RELEASE");
  });

  it("016/FR-015 aceita pelo professor com a atividade ativa: termina na aceitação", () => {
    expect(pauseTime({ startedAt: at(0), releasedAt: null }, { acceptedAt: at(7), activityEndedAt: null }, at(50))).toEqual({
      endedAt: at(7),
      endedBy: "ACCEPTED",
      seconds: 420,
    });
  });

  it("016/FR-015 atividade encerrada ou cancelada: termina no encerramento", () => {
    expect(pauseTime({ startedAt: at(0), releasedAt: null }, { acceptedAt: null, activityEndedAt: at(9) }, at(50))).toEqual({
      endedAt: at(9),
      endedBy: "ACTIVITY_CLOSED",
      seconds: 540,
    });
  });

  it("016/FR-015 aceitação depois do encerramento: a pausa já tinha terminado no encerramento", () => {
    expect(pauseTime({ startedAt: at(0), releasedAt: null }, { acceptedAt: at(12), activityEndedAt: at(9) }, at(50))).toMatchObject({
      endedAt: at(9),
      endedBy: "ACTIVITY_CLOSED",
    });
    expect(pauseTime({ startedAt: at(0), releasedAt: null }, { acceptedAt: at(9), activityEndedAt: at(9) }, at(50)).endedBy).toBe("ACCEPTED");
  });

  it("segundos inteiros, nunca negativos (relógio do servidor)", () => {
    expect(pauseTime({ startedAt: at(0), releasedAt: at(0, 59) }, none, at(5)).seconds).toBe(59);
    expect(pauseTime({ startedAt: at(1), releasedAt: null }, none, at(0)).seconds).toBe(0);
  });

  it("016/FR-019 o tempo fora da tentativa é a soma das pausas, a aberta até agora", () => {
    const pauses = [
      { startedAt: at(0), releasedAt: at(2) },
      { startedAt: at(5), releasedAt: at(6, 30) },
      { startedAt: at(10), releasedAt: null },
    ];
    expect(secondsAway(pauses, none, at(11))).toBe(120 + 90 + 60);
    expect(secondsAway(pauses, { acceptedAt: null, activityEndedAt: at(10, 15) }, at(30))).toBe(120 + 90 + 15);
    expect(secondsAway([], none, at(11))).toBe(0);
  });

  it("018/FR-027 prova: a pausa aberta no fim do tempo termina no fim (TIME_EXPIRED), nunca antes dele", () => {
    const pause = { startedAt: at(0), releasedAt: null };
    expect(pauseTime(pause, { ...none, examEndsAt: at(10) }, at(9, 59))).toEqual({ endedAt: null, endedBy: null, seconds: 599 });
    expect(pauseTime(pause, { ...none, examEndsAt: at(10) }, at(10))).toEqual({ endedAt: at(10), endedBy: "TIME_EXPIRED", seconds: 600 });
    expect(pauseTime(pause, { ...none, examEndsAt: at(10) }, at(50))).toMatchObject({ endedAt: at(10), endedBy: "TIME_EXPIRED" });
    // A release before the end keeps its own end; the end of the exam never moves it.
    expect(pauseTime({ startedAt: at(0), releasedAt: at(2) }, { ...none, examEndsAt: at(10) }, at(50)).endedBy).toBe("RELEASE");
  });

  it("018/FR-027 prova encerrada pelo professor antes do tempo: a pausa termina no encerramento, que é também o fim da tentativa", () => {
    // `endsAt` is capped by the close (exam-time.ts), so both tie and the close names the end.
    expect(pauseTime({ startedAt: at(0), releasedAt: null }, { acceptedAt: null, activityEndedAt: at(7), examEndsAt: at(7) }, at(50))).toMatchObject({
      endedAt: at(7),
      endedBy: "ACTIVITY_CLOSED",
    });
    expect(secondsAway([{ startedAt: at(0), releasedAt: null }], { ...none, examEndsAt: at(4) }, at(30))).toBe(240);
  });
});
