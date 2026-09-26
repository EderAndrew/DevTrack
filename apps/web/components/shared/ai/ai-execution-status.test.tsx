import type { AiExecutionStatus as Value } from "@repo/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { AiExecutionStatus } from "./ai-execution-status";

const CASES: [Value, string][] = [
  ["QUEUED", "Na fila"],
  ["RUNNING", "Processando"],
  ["WAITING_TOOL", "Processando"],
  ["VALIDATING_OUTPUT", "Processando"],
  ["COMPLETED", "Concluída"],
  ["FAILED", "Falhou"],
  ["CANCELLED", "Cancelada"],
  ["TIMED_OUT", "Tempo esgotado"],
];

describe("006/US9-1 AiExecutionStatus mostra cada estado com texto e ícone, anunciado sem mover o foco", () => {
  it.each(CASES)("%s → %s", async (status, text) => {
    const { container } = render(<AiExecutionStatus status={status} />);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe(text);
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    expect(region.contains(document.activeElement)).toBe(false);
    await expectNoA11yViolations(container);
  });

  it("o ícone de Processando só gira com movimento permitido", () => {
    render(<AiExecutionStatus status="RUNNING" />);
    expect(screen.getByRole("status").querySelector("svg")?.getAttribute("class")).toMatch(/motion-safe:animate-spin/);
  });

  it("Cancelando… enquanto o cancelamento não termina; o estado final vence", () => {
    const { rerender } = render(<AiExecutionStatus status="RUNNING" cancelRequested />);
    expect(screen.getByRole("status").textContent).toBe("Cancelando…");
    rerender(<AiExecutionStatus status="CANCELLED" cancelRequested />);
    expect(screen.getByRole("status").textContent).toBe("Cancelada");
  });

  it("a troca de estado atualiza a mesma região viva", () => {
    const { rerender } = render(<AiExecutionStatus status="QUEUED" />);
    const region = screen.getByRole("status");
    rerender(<AiExecutionStatus status="COMPLETED" />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region.textContent).toBe("Concluída");
  });
});
