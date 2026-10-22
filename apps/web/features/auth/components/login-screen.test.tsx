import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/a11y";
import { renderWithProviders } from "../../../test/render";
import { Toaster } from "@/components/ui/toast";
import { LoginScreen } from "./login-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

describe("LoginScreen: início e login na mesma tela", () => {
  it("apresenta o DevTrack ao lado do formulário de login", () => {
    renderWithProviders(<Toaster><LoginScreen next="/conta/sessoes" /></Toaster>);
    const about = screen.getByRole("region", { name: "Sobre o DevTrack" });
    expect(about.textContent).toContain("DevTrack");
    expect(within(about).getByText("Beta")).toBeTruthy();
    expect(about.textContent).toContain("Ensine. Avalie. Acompanhe a evolução.");
    expect(about.textContent).toContain("Menos respostas prontas. Mais aprendizado real.");
    expect(about.textContent).toContain(
      "Um ambiente para atividades e avaliações que ajuda professores a acompanhar como cada aluno pensa, resolve problemas e evolui.",
    );
    expect(screen.getByText(/Desenvolvido por/).textContent).toBe(
      `© ${new Date().getFullYear()} · Desenvolvido por Nativecode. Todos os direitos reservados.`,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Entrar" })).toBeTruthy();
    expect(screen.getByRole("form", { name: "Entrar" })).toBeTruthy();
  });

  it("tem o link de senha esquecida e nenhum link de cadastro", () => {
    renderWithProviders(<Toaster><LoginScreen next="/conta/sessoes" /></Toaster>);
    expect(screen.getByRole("link", { name: "Esqueci minha senha" }).getAttribute("href")).toBe("/esqueci-senha");
    expect(screen.queryByRole("link", { name: /Criar conta/ })).toBeNull();
  });

  describe("versão da aplicação", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("mostra a versão gravada no build", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.1.42 (b3924e0)");
      renderWithProviders(<Toaster><LoginScreen next="/conta/sessoes" /></Toaster>);
      expect(screen.getByText("Versão 0.1.42 (b3924e0)")).toBeTruthy();
    });

    it("sem versão no build mostra dev", () => {
      vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
      renderWithProviders(<Toaster><LoginScreen next="/conta/sessoes" /></Toaster>);
      expect(screen.getByText("Versão dev")).toBeTruthy();
    });
  });

  it("não tem violações de acessibilidade", async () => {
    const { container } = renderWithProviders(<Toaster><LoginScreen next="/conta/sessoes" /></Toaster>);
    await expectNoA11yViolations(container);
  });
});
