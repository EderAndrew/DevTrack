import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y";
import { renderWithProviders } from "../../test/render";
import { AppShell, type AppShellProps } from "./app-shell";

// 005 US3 (FR-022, FR-023; contracts/layouts.md "AppShell"; research V12, V20).

const navigation = vi.hoisted(() => ({ pathname: "/turmas" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const SESSOES = ["sessoes.proprias.listar", "sessoes.proprias.revogar"];
const TEACHER = [...SESSOES, "turmas.criar", "turmas.visualizar", "disciplinas.visualizar"];
const ADMIN = [...SESSOES, "professores.visualizar", "managers.visualizar", "usuarios.visualizar"];

const me = (permissions: string[]): AppShellProps["me"] => ({ name: "Ana Souza", emailVerified: true, permissions });

let mobile = false;

function renderShell(props: Partial<AppShellProps> = {}) {
  return renderWithProviders(
    <AppShell me={me(TEACHER)} defaultOpen {...props}>
      <h1>Turmas</h1>
    </AppShell>,
  );
}

const menu = () => screen.getByRole("navigation", { name: "Menu principal" });
const menuLinks = () =>
  within(menu())
    .queryAllByRole("link")
    .map((link) => link.textContent);

describe("005/US3 AppShell das telas internas", () => {
  beforeEach(() => {
    navigation.pathname = "/turmas";
    mobile = false;
    document.cookie = "sidebar_state=; path=/; max-age=0";
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: mobile,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("005/US3-1 menu lateral, barra superior com o nome da área e área principal", async () => {
    const { container } = renderShell();
    expect(menu()).toBeTruthy();
    const banner = screen.getByRole("banner");
    expect(banner.textContent).toContain("Turmas");
    expect(within(banner).getByRole("button", { name: "Abrir ou fechar o menu" })).toBeTruthy();
    const main = screen.getByRole("main");
    expect(main.id).toBe("conteudo");
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(main.contains(banner)).toBe(false);
    expect(within(main).getByRole("heading", { level: 1, name: "Turmas" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("005/US3-2 o item da área atual tem aria-current e o estilo ativo", () => {
    navigation.pathname = "/disciplinas";
    renderShell();
    const current = within(menu()).getByRole("link", { name: "Minhas disciplinas" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.getAttribute("data-active")).toBe("true");
    expect(current.getAttribute("class")).toMatch(/data-\[active=true\]:bg-sidebar-accent/);
    expect(within(menu()).getByRole("link", { name: "Turmas" }).getAttribute("aria-current")).toBeNull();
  });

  it("005/US3-3 recolhido só com ícones e nomes acessíveis; a escolha fica no cookie sidebar_state", async () => {
    const user = userEvent.setup();
    const { container } = renderShell();
    await user.click(screen.getByRole("button", { name: "Abrir ou fechar o menu" }));
    const sidebar = container.querySelector('[data-slot="sidebar"][data-state]');
    expect(sidebar?.getAttribute("data-state")).toBe("collapsed");
    expect(sidebar?.getAttribute("data-collapsible")).toBe("icon");
    expect(document.cookie).toContain("sidebar_state=false");
    expect(menuLinks()).toEqual(["Minhas disciplinas", "Turmas", "Meu perfil"]);
    await user.keyboard("{Control>}b{/Control}");
    expect(sidebar?.getAttribute("data-state")).toBe("expanded");
    expect(document.cookie).toContain("sidebar_state=true");
  });

  it("005/US3-3 começa recolhido quando o cookie pediu", () => {
    const { container } = renderShell({ defaultOpen: false });
    expect(container.querySelector('[data-slot="sidebar"][data-state]')?.getAttribute("data-state")).toBe("collapsed");
  });

  it("005/US3-4 sem permissão a área não aparece", () => {
    renderShell({ me: me(ADMIN) });
    expect(menuLinks()).not.toContain("Turmas");
    expect(menuLinks()).not.toContain("Minhas disciplinas");
    renderShell({ me: me(SESSOES) });
    expect(screen.getAllByRole("navigation", { name: "Menu principal" }).at(-1)?.textContent).not.toMatch(
      /Professores|Turmas|disciplinas/,
    );
  });

  it("005/US3-5 nenhuma área futura aparece no menu", () => {
    renderShell({ me: me([...TEACHER, ...ADMIN, "turmas.proprias.listar"]) });
    expect(menu().textContent).not.toMatch(/exerc[ií]cio|avalia[çc]|banco de quest|resultado/i);
  });

  it("005/US3-6 em tela estreita o menu abre e fecha como painel", async () => {
    mobile = true;
    const user = userEvent.setup();
    renderShell();
    expect(screen.queryByRole("navigation", { name: "Menu principal" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Abrir ou fechar o menu" }));
    const panel = screen.getByRole("dialog", { name: "Menu" });
    expect(within(panel).getByRole("navigation", { name: "Menu principal" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
