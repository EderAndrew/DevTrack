import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { ForgotPasswordScreen } from "./forgot-password-screen";

describe("ForgotPasswordScreen", () => {
  it("mostra DevTrack acima do título, o formulário e o link de volta", () => {
    renderWithProviders(<ForgotPasswordScreen />);
    const brand = screen.getByText("DevTrack");
    const heading = screen.getByRole("heading", { level: 1, name: "Esqueci minha senha" });
    expect(brand.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(/Informe o e-mail da sua conta/)).toBeTruthy();
    expect(screen.getByRole("form", { name: "Recuperar senha" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Voltar para entrar" }).getAttribute("href")).toBe("/entrar");
  });

  it("não tem violações de acessibilidade", async () => {
    const { container } = renderWithProviders(<ForgotPasswordScreen />);
    await expectNoA11yViolations(container);
  });
});
