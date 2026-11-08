import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ResetPasswordScreen } from "./reset-password-screen";

const TOKEN = "p".repeat(43);

describe("ResetPasswordScreen", () => {
  beforeEach(() => window.history.replaceState(null, "", `/redefinir-senha?token=${TOKEN}`));

  it("mostra DevTrack centralizado acima do título, o formulário e o link de volta", () => {
    renderWithProviders(<ResetPasswordScreen token={TOKEN} />);
    // The wordmark splits "Dev" and "Track" into two colours; the match is on the whole name.
    const brand = screen.getByText((_, element) => element?.textContent === "DevTrack" && element.matches(".font-brand"));
    expect(brand.parentElement?.textContent).toContain("Beta");
    const heading = screen.getByRole("heading", { level: 1, name: "Redefinir senha" });
    expect(brand.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("form", { name: "Definir nova senha" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar para entrar" }).getAttribute("href")).toBe("/entrar");
  });

  it("não tem violações de acessibilidade", async () => {
    const { container } = renderWithProviders(<ResetPasswordScreen token={TOKEN} />);
    await expectNoA11yViolations(container);
  });
});
