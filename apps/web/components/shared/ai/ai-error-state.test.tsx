import type { AiErrorCode } from "@repo/contracts";
import { AiErrorCodeSchema } from "@repo/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AI_ERROR_GUIDANCE } from "@/lib/messages/error-messages";
import { expectNoA11yViolations } from "../../../test/a11y";
import { AiErrorState } from "./ai-error-state";

const CODES = AiErrorCodeSchema.options as AiErrorCode[];

describe("006/US9-2 AiErrorState diz o que aconteceu e o que fazer, pelo código", () => {
  it.each(CODES)("%s: título e orientação do catálogo, sem detalhe interno", async (code) => {
    const { container } = render(<AiErrorState code={code} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(AI_ERROR_GUIDANCE[code].title);
    expect(alert.textContent).toContain(AI_ERROR_GUIDANCE[code].guidance);
    expect(alert.textContent).not.toContain(code);
    expect(alert.textContent).not.toMatch(/provedor|modelo|stack|fake/i);
    expect(screen.queryByRole("button")).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("AI_TIMEOUT usa o texto do contrato", () => {
    render(<AiErrorState code="AI_TIMEOUT" />);
    expect(screen.getByText("A IA demorou demais para responder.")).toBeTruthy();
    expect(screen.getByText("Tente de novo em alguns minutos.")).toBeTruthy();
  });

  it("Tentar de novo só com onRetry, e operável pelo teclado", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<AiErrorState code="AI_PROVIDER_ERROR" onRetry={onRetry} />);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Tentar de novo" }));
    await user.keyboard("{Enter}");
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });
});
