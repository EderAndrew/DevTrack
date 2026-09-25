import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { areaFor } from "@/lib/navigation";
import { expectNoA11yViolations } from "../../test/a11y";
import { renderWithProviders } from "../../test/render";
import { Topbar } from "./topbar";

// 005 US3-1 (FR-019, FR-022; contracts/layouts.md "Topbar").

const navigation = vi.hoisted(() => ({ pathname: "/turmas/abc/planejamento" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

describe("005/US3-1 Topbar", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("botão do menu com nome acessível e o nome da área pela rota", async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <SidebarProvider>
        <Topbar />
      </SidebarProvider>,
    );
    const banner = screen.getByRole("banner");
    expect(banner.textContent).toContain("Turmas");
    expect(banner.getAttribute("class")).toContain("z-(--z-sticky)");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abrir ou fechar o menu" }));
    await expectNoA11yViolations(container);
  });

  it.each([
    ["/turmas/abc/planejamento", "Turmas"],
    ["/turmas", "Turmas"],
    ["/disciplinas/x/ementa/y", "Minhas disciplinas"],
    ["/professores", "Professores"],
    ["/admin/managers", "Gestores"],
    ["/admin/usuarios", "Usuários"],
    ["/conta/perfil", "Minha conta"],
    ["/minhas-turmas", "Minhas turmas"],
    ["/turmasx", null],
    ["/", null],
  ])("areaFor(%s) = %s", (pathname, area) => {
    expect(areaFor(pathname)).toBe(area);
  });
});
