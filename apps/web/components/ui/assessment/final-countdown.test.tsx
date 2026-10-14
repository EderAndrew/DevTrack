import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { FINAL_COUNTDOWN_ANNOUNCEMENT, FinalCountdown } from "./final-countdown";

// 018/FR-012 (contracts/web-ui.md, "Alerts"): in the last 10 seconds a centered 10…1, one
// `role="alert"` announced once, no animation, and the page stays usable underneath.

describe("018/FR-012 FinalCountdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  const endingIn = (ms: number) => {
    const end = Date.now() + ms;
    return () => end - Date.now();
  };
  const shown = () => document.querySelector("[data-slot=final-countdown] [aria-hidden=true]")?.textContent ?? null;

  it("018/US3-4 018/SC-003 faltando 10 segundos, a contagem regressiva 10…1 até zero, anunciada uma única vez", async () => {
    render(<FinalCountdown remaining={endingIn(15_000)} />);
    expect(shown()).toBeNull();
    act(() => vi.advanceTimersByTime(5_000));
    const seen: (string | null)[] = [shown()];
    const alerts = () => screen.getAllByRole("alert");
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]!.textContent).toBe(FINAL_COUNTDOWN_ANNOUNCEMENT);
    const announcement = alerts()[0];
    for (let second = 0; second < 9; second += 1) {
      act(() => vi.advanceTimersByTime(1_000));
      seen.push(shown());
      // The same live node, never re-rendered with new text: announced once.
      expect(alerts()).toEqual([announcement]);
    }
    expect(seen).toEqual(["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"]);
    act(() => vi.advanceTimersByTime(1_000));
    expect(document.querySelector("[data-slot=final-countdown]")).toBeNull();
  });

  it("018/SC-003 nada aparece se a prova abre com menos de 10 segundos", () => {
    render(<FinalCountdown remaining={endingIn(8_000)} />);
    act(() => vi.advanceTimersByTime(5_000));
    expect(document.querySelector("[data-slot=final-countdown]")).toBeNull();
  });

  it("prefers-reduced-motion: sem animação, e a contagem não bloqueia a página", () => {
    render(<FinalCountdown remaining={endingIn(10_500)} />);
    act(() => vi.advanceTimersByTime(1_000));
    const overlay = document.querySelector<HTMLElement>("[data-slot=final-countdown]")!;
    expect(overlay.className).toContain("pointer-events-none");
    expect(overlay.outerHTML).not.toMatch(/(?<!motion-safe:)animate-/);
  });

  it("sem violações de acessibilidade enquanto conta", async () => {
    vi.useRealTimers();
    let left = 11_000;
    render(<FinalCountdown remaining={() => left} />);
    left = 7_000;
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(shown()).toBe("7");
    await expectNoA11yViolations(document.body);
  });
});
