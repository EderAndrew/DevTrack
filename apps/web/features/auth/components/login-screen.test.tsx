import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { LoginScreen } from "./login-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("LoginScreen: início e login na mesma tela", () => {
  it("apresenta o DevTrack ao lado do formulário de login", () => {
    renderWithProviders(<LoginScreen next="/conta/sessoes" />);
    const about = screen.getByRole("region", { name: "Sobre o DevTrack" });
    expect(about.textContent).toContain("DevTrack");
    expect(about.textContent).toContain("Plataforma de ensino e avaliação configurável por professor.");
    expect(screen.getByRole("heading", { level: 1, name: "Entrar" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "Entrar" })).toBeTruthy();
  });

  it("tem o link de senha esquecida e nenhum link de cadastro", () => {
    renderWithProviders(<LoginScreen next="/conta/sessoes" />);
    expect(screen.getByRole("link", { name: "Esqueci minha senha" }).getAttribute("href")).toBe("/esqueci-senha");
    expect(screen.queryByRole("link", { name: /Criar conta/ })).toBeNull();
  });

  describe("versão da aplicação", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("mostra a versão gravada no build", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.1.42 (b3924e0)");
      renderWithProviders(<LoginScreen next="/conta/sessoes" />);
      expect(screen.getByText("Versão 0.1.42 (b3924e0)")).toBeTruthy();
    });

    it("sem versão no build mostra dev", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
      renderWithProviders(<LoginScreen next="/conta/sessoes" />);
      expect(screen.getByText("Versão dev")).toBeTruthy();
    });
  });

  it("não tem violações de acessibilidade", async () => {
    const { container } = renderWithProviders(<LoginScreen next="/conta/sessoes" />);
    await expectNoA11yViolations(container);
  });
});
