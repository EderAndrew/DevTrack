import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { AiProcessingIndicator } from "./ai-processing-indicator";

describe("006/US9-1 AiProcessingIndicator", () => {
  it("texto padrão, aria-busy, sem porcentagem e sem mover o foco", async () => {
    const { container } = render(<AiProcessingIndicator />);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("Processando com IA…");
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector("[role='progressbar'], [aria-valuenow]")).toBeNull();
    expect(region.querySelector("svg")?.getAttribute("class")).toMatch(/motion-safe:animate-spin/);
    expect(document.activeElement).toBe(document.body);
    await expectNoA11yViolations(container);
  });

  it("aceita outro texto", () => {
    render(<AiProcessingIndicator label="Lendo a ementa…" />);
    expect(screen.getByRole("status").textContent).toBe("Lendo a ementa…");
  });
});
