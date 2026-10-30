import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { checkText } from "../../../test/design-system/scan";
import { ExamTimer, formatSecondsLeft } from "./exam-timer";

// 018/FR-012 (design-system/exam-mode.md, "ExamTimer"): the server's time left, "mm:ss restantes",
// `role="timer"` with nothing announced each second, warning from 5 min and danger from 1 min with
// the icon too (never colour alone).

const MINUTE = 60_000;

describe("018/FR-012 ExamTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  const endingIn = (ms: number) => {
    const end = Date.now() + ms;
    return () => end - Date.now();
  };

  it("018/US3-2 mostra o tempo restante do servidor e conta a cada segundo, sem anunciar", async () => {
    render(<ExamTimer remaining={endingIn(12 * MINUTE + 5_000)} />);
    const timer = screen.getByRole("timer", { name: "Tempo restante" });
    expect(timer.getAttribute("aria-live")).toBe("off");
    expect(timer.textContent).toBe("12:05 restantes");
    act(() => vi.advanceTimersByTime(6_000));
    expect(timer.textContent).toBe("11:59 restantes");
    // axe runs on real timers.
    vi.useRealTimers();
    await expectNoA11yViolations(document.body);
  });

  it("aviso a partir de 5 min e perigo a partir de 1 min, com o ícone e a cor; nunca negativo", () => {
    render(<ExamTimer remaining={endingIn(5 * MINUTE + 1_000)} />);
    const timer = screen.getByRole("timer");
    expect(timer.dataset.state).toBe("normal");
    act(() => vi.advanceTimersByTime(1_000));
    expect(timer.dataset.state).toBe("warning");
    expect(timer.className).toContain("text-warning-text");
    act(() => vi.advanceTimersByTime(4 * MINUTE));
    expect(timer.dataset.state).toBe("danger");
    expect(timer.className).toContain("text-danger-text");
    act(() => vi.advanceTimersByTime(2 * MINUTE));
    expect(timer.textContent).toBe("00:00 restantes");
  });

  it("mm:ss abaixo de uma hora, h:mm:ss a partir dela", () => {
    expect(formatSecondsLeft(0)).toBe("00:00");
    expect(formatSecondsLeft(59)).toBe("00:59");
    expect(formatSecondsLeft(3_599)).toBe("59:59");
    expect(formatSecondsLeft(7_200)).toBe("2:00:00");
  });
});

// 022/US3-4: the theme is only the tokens' values; the Exam Mode keeps its classes and rules.
describe("022/US3-4 ExamTimer no tema claro", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
  });
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("as classes do cronômetro continuam só de tokens em cada estado e axe não aponta violações", async () => {
    const classes = new Map<string, string>();
    for (const ms of [30 * MINUTE, 4 * MINUTE, 30_000]) {
      const { unmount } = render(<ExamTimer remaining={() => ms} />);
      const timer = screen.getByRole("timer", { name: "Tempo restante" });
      classes.set(timer.dataset.state ?? "", timer.className);
      unmount();
    }
    expect([...classes.keys()]).toEqual(["normal", "warning", "danger"]);
    render(<ExamTimer remaining={() => 30_000} />);
    for (const className of classes.values()) {
      expect(checkText("components/ui/assessment/exam-timer.tsx", `<div className="${className}">`)).toEqual([]);
    }
    await expectNoA11yViolations(document.body);
  });
});
