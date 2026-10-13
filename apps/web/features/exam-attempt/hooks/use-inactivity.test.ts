import type { StudentActivity } from "@repo/contracts";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { examRunning } from "../schemas/exam-attempt";
import { INTERACTION_EVENTS, useInactivity } from "./use-inactivity";

// 018/US4-3 (research T7): after the exam's inactivity limit with no keyboard, mouse, touch or scroll,
// one INACTIVITY event with `idleSeconds`, then nothing until the next interaction. Suspended while
// the page is hidden (that is already a screen exit) and whenever the exam is not running.

const LIMIT_S = 30;

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("018/US4-3 useInactivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  const watch = (enabled = true) => {
    const onIdle = vi.fn();
    const hook = renderHook((props: { enabled: boolean }) => useInactivity({ limitSeconds: LIMIT_S, enabled: props.enabled, onIdle }), {
      initialProps: { enabled },
    });
    return { onIdle, hook };
  };

  it("018/US4-3 depois do limite configurado, um evento com idleSeconds; um período sem interação conta uma vez", () => {
    const { onIdle } = watch();
    act(() => vi.advanceTimersByTime(LIMIT_S * 1000 - 1));
    expect(onIdle).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalledWith(LIMIT_S);
    // Still idle: silent, however long it lasts.
    act(() => vi.advanceTimersByTime(10 * LIMIT_S * 1000));
    expect(onIdle).toHaveBeenCalledTimes(1);
    // An interaction starts a new period.
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    });
    act(() => vi.advanceTimersByTime(LIMIT_S * 1000));
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it("018/US4-3 teclado, mouse, toque e rolagem reiniciam a contagem", () => {
    const { onIdle } = watch();
    for (const type of INTERACTION_EVENTS) {
      act(() => vi.advanceTimersByTime(LIMIT_S * 1000 - 1_000));
      act(() => {
        (type === "scroll" ? window : document).dispatchEvent(new Event(type, { bubbles: true }));
      });
    }
    expect(onIdle).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(LIMIT_S * 1000));
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("018/US4-3 suspensa com a página oculta: a volta começa um período novo", () => {
    const { onIdle } = watch();
    act(() => vi.advanceTimersByTime(20_000));
    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(5 * LIMIT_S * 1000));
    expect(onIdle).not.toHaveBeenCalled();
    act(() => setVisibility("visible"));
    act(() => vi.advanceTimersByTime(LIMIT_S * 1000 - 1));
    expect(onIdle).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("018/US4-3 desligada (pausada, retida, antes do início ou depois do fim): nada é enviado, e desligar no meio cancela", () => {
    const off = watch(false);
    act(() => vi.advanceTimersByTime(5 * LIMIT_S * 1000));
    expect(off.onIdle).not.toHaveBeenCalled();

    const on = watch(true);
    act(() => vi.advanceTimersByTime(LIMIT_S * 1000 - 1_000));
    on.hook.rerender({ enabled: false });
    act(() => vi.advanceTimersByTime(5 * LIMIT_S * 1000));
    expect(on.onIdle).not.toHaveBeenCalled();
    on.hook.unmount();
  });
});

describe("018/US4-3 examRunning: quando a inatividade é observada", () => {
  const base = {
    canAnswer: true,
    submission: null,
    pause: null,
    attempt: { number: 1, startedAt: "2026-10-01T12:00:00.000Z", lastSavedAt: null, answers: [] },
    exam: {
      durationMinutes: 60,
      inactivityLimitSeconds: 30,
      startDeadline: "2026-10-01T12:15:00.000Z",
      endsAt: "2026-10-01T13:00:00.000Z",
      occurrences: { count: 0, warningsAllowed: 3 },
      hold: null,
      endReason: null,
    },
  } as unknown as StudentActivity;

  it("018/US4-3 só com a prova em andamento", () => {
    expect(examRunning(base)).toBe(true);
    const cases: [string, Partial<StudentActivity>][] = [
      ["pausada", { pause: { id: "p", initiatedBy: "TEACHER", reason: "TEACHER", note: null, startedAt: "2026-10-01T12:10:00.000Z", endedAt: null } as never }],
      ["retida", { exam: { ...base.exam!, hold: { openedAt: "2026-10-01T12:20:00.000Z" } } }],
      ["antes do início", { attempt: null, exam: { ...base.exam!, endsAt: null } }],
      ["depois do fim", { canAnswer: false, submission: { submittedAt: "2026-10-01T13:00:00.000Z", late: false, acceptedByTeacher: false, blankCount: 0 } }],
    ];
    for (const [name, change] of cases) expect(examRunning({ ...base, ...change } as StudentActivity), name).toBe(false);
  });
});
