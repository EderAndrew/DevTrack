import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { TimeAlert } from "./time-alert";

// 018/FR-012 (contracts/web-ui.md, "Alerts"): "Faltam 10 minutos." and "Faltam 5 minutos." when the
// time crosses each mark, polite and non-blocking; nothing for a mark already behind at the start.

const MINUTE = 60_000;

describe("018/FR-012 TimeAlert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
  });
  afterEach(() => vi.useRealTimers());

  const endingIn = (ms: number) => {
    const end = Date.now() + ms;
    return () => end - Date.now();
  };

  it("018/US3-3 018/SC-003 faltando 10 e depois 5 minutos, um alerta não bloqueante anunciado a leitores de tela", async () => {
    render(<TimeAlert remaining={endingIn(11 * MINUTE)} />);
    expect(screen.queryByRole("status")).toBeNull();
    act(() => vi.advanceTimersByTime(MINUTE - 1_000));
    expect(screen.queryByRole("status")).toBeNull();
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("status").textContent).toContain("Faltam 10 minutos.");
    expect(document.activeElement).toBe(document.body);

    act(() => vi.advanceTimersByTime(5 * MINUTE));
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Faltam 5 minutos.");
    expect(status.textContent).not.toContain("10 minutos");
    // axe runs on real timers.
    vi.useRealTimers();
    await expectNoA11yViolations(document.body);
  });

  it("018/SC-003 \"Entendi\" esconde o alerta pelo teclado; o próximo marco aparece mesmo assim", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    let left = 10 * MINUTE + 1_000;
    const { rerender } = render(<TimeAlert remaining={() => left} />);
    left = 10 * MINUTE;
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Entendi" }));
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("status")).toBeNull();
    left = 5 * MINUTE;
    rerender(<TimeAlert remaining={() => left} />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(screen.getByRole("status").textContent).toContain("Faltam 5 minutos.");
  });

  it("018/SC-003 nada aparece se a prova começa abaixo do marco (prova curta ou recarga depois dele)", () => {
    render(<TimeAlert remaining={endingIn(9 * MINUTE)} />);
    act(() => vi.advanceTimersByTime(3 * MINUTE));
    expect(screen.queryByText("Faltam 10 minutos.")).toBeNull();
    act(() => vi.advanceTimersByTime(2 * MINUTE));
    expect(screen.getByRole("status").textContent).toContain("Faltam 5 minutos.");
  });

  it("018/SC-003 uma prova de 4 minutos não mostra alerta nenhum", () => {
    render(<TimeAlert remaining={endingIn(4 * MINUTE)} />);
    act(() => vi.advanceTimersByTime(4 * MINUTE));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
