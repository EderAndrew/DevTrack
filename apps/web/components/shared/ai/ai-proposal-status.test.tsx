import type { AiProposalStatus as Value } from "@repo/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { AiProposalStatus } from "./ai-proposal-status";

describe("006/US9-1 AiProposalStatus com texto e ícone", () => {
  it.each([
    ["READY_FOR_REVIEW", "Pronta para revisão"],
    ["APPROVED", "Aprovada"],
    ["PARTIALLY_APPROVED", "Aprovada em parte"],
    ["REJECTED", "Rejeitada"],
    ["EXPIRED", "Expirada"],
  ] as [Value, string][])("%s → %s", async (status, text) => {
    const { container } = render(<AiProposalStatus status={status} />);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe(text);
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
