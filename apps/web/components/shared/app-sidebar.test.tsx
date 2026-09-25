import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { expectNoA11yViolations } from "../../test/a11y";
import { renderWithProviders } from "../../test/render";
import { AppSidebar, type AppSidebarProps } from "./app-sidebar";

const navigation = vi.hoisted(() => ({ pathname: "/conta/perfil" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

/** Same sets as apps/api/test/security/authorization-matrix.ts (contracts/permissions.md). */
const SESSOES = ["sessoes.proprias.listar", "sessoes.proprias.revogar"];
const PERMISSIONS = {
  STUDENT: [...SESSOES, "turmas.proprias.listar"],
  TEACHER: [
    ...SESSOES,
    "turmas.criar",
    "turmas.visualizar",
    "turmas.editar",
    "turmas.alterar_situacao",
    "disciplinas.visualizar",
    "disciplinas.criar",
    "disciplinas.editar",
  ],
  MANAGER: [...SESSOES, "professores.visualizar", "professores.convidar"],
  ADMIN: [...SESSOES, "professores.visualizar", "managers.visualizar", "usuarios.visualizar", "ia.operacao.visualizar", "ia.agentes.gerenciar"],
};

const me = (permissions: string[], emailVerified = true): AppSidebarProps["me"] => ({ name: "Ana Souza", emailVerified, permissions });

function renderSidebar(props: AppSidebarProps) {
  return renderWithProviders(
    <SidebarProvider>
      <AppSidebar {...props} />
    </SidebarProvider>,
  );
}

const menuLinks = () =>
  within(screen.getByRole("navigation", { name: "Menu principal" }))
    .queryAllByRole("link")
    .map((link) => link.textContent);

describe("AppSidebar (menu lateral das telas internas, UX only)", () => {
  beforeEach(() => {
    navigation.pathname = "/conta/perfil";
    // jsdom has no matchMedia; the desktop layout is enough here.
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    // jsdom has no ResizeObserver either; collapsed, a tooltip may open under the pointer and Radix measures it.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = () => undefined;
        unobserve = () => undefined;
        disconnect = () => undefined;
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ["STUDENT", ["Minhas turmas", "Meu perfil"]],
    ["TEACHER", ["Minhas disciplinas", "Turmas", "Meu perfil"]],
    ["MANAGER", ["Professores", "Meu perfil"]],
    ["ADMIN", ["Professores", "Gestores", "Usuários", "Operação de IA", "Meu perfil"]],
  ] as const)("%s vê exatamente %j", async (role, expected) => {
    const { container } = renderSidebar({ me: me(PERMISSIONS[role]) });
    expect(menuLinks()).toEqual(expected);
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
    expect(screen.getByText("Ana Souza")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("sem área administrativa, não há o grupo Usuários", () => {
    renderSidebar({ me: me(PERMISSIONS.STUDENT) });
    expect(screen.queryByRole("button", { name: "Usuários" })).toBeNull();
  });

  it("e-mail não verificado não vê áreas administrativas, mesmo com permissões", () => {
    renderSidebar({ me: me(PERMISSIONS.ADMIN, false) });
    expect(menuLinks()).toEqual(["Meu perfil"]);
  });

  it("o grupo Usuários abre e fecha", async () => {
    renderSidebar({ me: me(PERMISSIONS.ADMIN) });
    const group = screen.getByRole("button", { name: "Usuários" });
    expect(group.getAttribute("aria-expanded")).toBe("true");
    await userEvent.setup().click(group);
    expect(group.getAttribute("aria-expanded")).toBe("false");
    expect(menuLinks()).toEqual(["Operação de IA", "Meu perfil"]);
  });

  it("e-mail não verificado não vê Turmas", () => {
    renderSidebar({ me: me(PERMISSIONS.TEACHER, false) });
    expect(menuLinks()).toEqual(["Meu perfil"]);
  });

  it("003/US7-1 Minhas turmas (turmas.proprias.listar) marca a página atual; professor que também é aluno vê as duas", () => {
    navigation.pathname = "/minhas-turmas";
    renderSidebar({ me: me([...PERMISSIONS.TEACHER, ...PERMISSIONS.STUDENT]) });
    expect(menuLinks()).toEqual(["Minhas disciplinas", "Turmas", "Minhas turmas", "Meu perfil"]);
    const link = screen.getByRole("link", { name: "Minhas turmas" });
    expect(link.getAttribute("href")).toBe("/minhas-turmas");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Turmas" }).getAttribute("aria-current")).toBeNull();
  });

  it("Turmas fica ativa nas telas de turma", () => {
    navigation.pathname = "/turmas";
    const { unmount } = renderSidebar({ me: me(PERMISSIONS.TEACHER) });
    expect(screen.getByRole("link", { name: "Turmas" }).getAttribute("aria-current")).toBe("page");
    unmount();
    navigation.pathname = "/turmas/abc/editar";
    renderSidebar({ me: me(PERMISSIONS.TEACHER) });
    expect(screen.getByRole("link", { name: "Turmas" }).getAttribute("data-active")).toBe("true");
  });

  it("004/US1 Minhas disciplinas (disciplinas.visualizar) fica ativa nas telas de disciplina", () => {
    navigation.pathname = "/disciplinas";
    const { unmount } = renderSidebar({ me: me(PERMISSIONS.TEACHER) });
    const link = screen.getByRole("link", { name: "Minhas disciplinas" });
    expect(link.getAttribute("href")).toBe("/disciplinas");
    expect(link.getAttribute("aria-current")).toBe("page");
    unmount();
    navigation.pathname = "/disciplinas/abc";
    renderSidebar({ me: me(PERMISSIONS.TEACHER) });
    expect(screen.getByRole("link", { name: "Minhas disciplinas" }).getAttribute("data-active")).toBe("true");
  });

  it("004/US8-1 004/FR-044 administrador sem papel de professor não vê Minhas disciplinas", () => {
    renderSidebar({ me: me(PERMISSIONS.ADMIN) });
    expect(screen.queryByRole("link", { name: "Minhas disciplinas" })).toBeNull();
    renderSidebar({ me: me(PERMISSIONS.TEACHER, false) });
    expect(screen.queryByRole("link", { name: "Minhas disciplinas" })).toBeNull();
  });

  it("004/US8-6 administrador que também é professor vê Minhas disciplinas", () => {
    renderSidebar({ me: me([...PERMISSIONS.ADMIN, ...PERMISSIONS.TEACHER]) });
    expect(screen.getByRole("link", { name: "Minhas disciplinas" })).toBeTruthy();
  });

  it("recolhido, mostra só os ícones e os itens mantêm o nome acessível", async () => {
    const { container } = renderWithProviders(
      <SidebarProvider defaultOpen={false}>
        <AppSidebar me={me([...PERMISSIONS.ADMIN, ...PERMISSIONS.TEACHER])} />
      </SidebarProvider>,
    );
    const sidebar = container.querySelector('[data-slot="sidebar"][data-state]');
    expect(sidebar?.getAttribute("data-state")).toBe("collapsed");
    expect(sidebar?.getAttribute("data-collapsible")).toBe("icon");
    expect(menuLinks()).toEqual(["Operação de IA", "Minhas disciplinas", "Turmas", "Meu perfil"]);
    expect(screen.getByRole("link", { name: "Turmas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("recolhido, o grupo Usuários expande o menu e abre o grupo", async () => {
    const { container } = renderWithProviders(
      <SidebarProvider defaultOpen={false}>
        <AppSidebar me={me(PERMISSIONS.ADMIN)} />
      </SidebarProvider>,
    );
    const group = screen.getByRole("button", { name: "Usuários" });
    expect(group.getAttribute("aria-expanded")).toBe("false");
    await userEvent.setup().click(group);
    expect(container.querySelector('[data-slot="sidebar"][data-state]')?.getAttribute("data-state")).toBe("expanded");
    expect(group.getAttribute("aria-expanded")).toBe("true");
    expect(menuLinks()).toEqual(["Professores", "Gestores", "Usuários", "Operação de IA", "Meu perfil"]);
  });

  it("006/US7-7 Operação de IA só com ia.operacao.visualizar, e marca a página atual", () => {
    navigation.pathname = "/admin/ia";
    const { unmount } = renderSidebar({ me: me(PERMISSIONS.ADMIN) });
    const link = screen.getByRole("link", { name: "Operação de IA" });
    expect(link.getAttribute("href")).toBe("/admin/ia");
    expect(link.getAttribute("aria-current")).toBe("page");
    unmount();
    for (const role of ["TEACHER", "MANAGER", "STUDENT"] as const) {
      const view = renderSidebar({ me: me(PERMISSIONS[role]) });
      expect(screen.queryByRole("link", { name: "Operação de IA" })).toBeNull();
      view.unmount();
    }
    renderSidebar({ me: me(PERMISSIONS.ADMIN, false) });
    expect(screen.queryByRole("link", { name: "Operação de IA" })).toBeNull();
  });

  it("marca a tela atual", () => {
    navigation.pathname = "/admin/managers";
    renderSidebar({ me: me(PERMISSIONS.ADMIN) });
    expect(screen.getByRole("link", { name: "Gestores" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Meu perfil" }).getAttribute("aria-current")).toBeNull();
  });
});
