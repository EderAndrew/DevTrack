import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { expectNoA11yViolations } from "../../test/a11y";
import { renderWithProviders } from "../../test/render";
import { AppSidebar, type AppSidebarProps } from "./app-sidebar";

const navigation = vi.hoisted(() => ({ pathname: "/conta/perfil", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
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
    navigation.search = "";
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
    ["ADMIN", ["Professores", "Gestores", "Usuários", "Saúde", "Indicadores", "Orçamentos", "Tarefas", "Modelos", "Agentes", "Configurações de modelo", "Meu perfil"]],
  ] as const)("%s vê exatamente %j", async (role, expected) => {
    const { container } = renderSidebar({ me: me(PERMISSIONS[role]) });
    expect(menuLinks()).toEqual(expected);
    expect(screen.getByRole("link", { name: "DevTrack" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("Beta")).toBeTruthy();
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
    expect(menuLinks()).toEqual(["Saúde", "Indicadores", "Orçamentos", "Tarefas", "Modelos", "Agentes", "Configurações de modelo", "Meu perfil"]);
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

  it("010/US1 Banco de Exercícios (questoes.visualizar) vem depois de Minhas disciplinas e fica ativo nas telas de exercícios", () => {
    navigation.pathname = "/exercicios/novo";
    renderSidebar({ me: me([...PERMISSIONS.TEACHER, "questoes.visualizar"]) });
    expect(menuLinks()).toEqual(["Minhas disciplinas", "Banco de Exercícios", "Turmas", "Meu perfil"]);
    const link = screen.getByRole("link", { name: "Banco de Exercícios" });
    expect(link.getAttribute("href")).toBe("/exercicios");
    expect(link.getAttribute("data-active")).toBe("true");
    expect(link.getAttribute("aria-current")).toBeNull();
  });

  it("011/US1-1 Banco de Trabalhos (trabalhos.visualizar) vem depois de Banco de Exercícios e fica ativo nas telas de trabalhos", () => {
    navigation.pathname = "/trabalhos/novo";
    renderSidebar({ me: me([...PERMISSIONS.TEACHER, "questoes.visualizar", "trabalhos.visualizar"]) });
    expect(menuLinks()).toEqual(["Minhas disciplinas", "Banco de Exercícios", "Banco de Trabalhos", "Turmas", "Meu perfil"]);
    const link = screen.getByRole("link", { name: "Banco de Trabalhos" });
    expect(link.getAttribute("href")).toBe("/trabalhos");
    expect(link.getAttribute("data-active")).toBe("true");
    expect(link.getAttribute("aria-current")).toBeNull();
  });

  it("011/FR-034 sem trabalhos.visualizar não há Banco de Trabalhos no menu", () => {
    renderSidebar({ me: me(PERMISSIONS.TEACHER) });
    expect(screen.queryByRole("link", { name: "Banco de Trabalhos" })).toBeNull();
  });

  it("018/FR-001 Banco de Provas (provas.visualizar) vem depois de Banco de Trabalhos e fica ativo nas telas de provas", () => {
    navigation.pathname = "/provas/nova";
    renderSidebar({ me: me([...PERMISSIONS.TEACHER, "questoes.visualizar", "trabalhos.visualizar", "provas.visualizar"]) });
    expect(menuLinks()).toEqual(["Minhas disciplinas", "Banco de Exercícios", "Banco de Trabalhos", "Banco de Provas", "Turmas", "Meu perfil"]);
    const link = screen.getByRole("link", { name: "Banco de Provas" });
    expect(link.getAttribute("href")).toBe("/provas");
    expect(link.getAttribute("data-active")).toBe("true");
  });

  it("018/FR-001 sem provas.visualizar não há Banco de Provas no menu", () => {
    renderSidebar({ me: me(PERMISSIONS.TEACHER) });
    expect(screen.queryByRole("link", { name: "Banco de Provas" })).toBeNull();
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
    expect(menuLinks()).toEqual(["Minhas disciplinas", "Turmas", "Meu perfil"]);
    expect(screen.getByRole("button", { name: "Operação de IA" })).toBeTruthy();
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
    expect(menuLinks()).toEqual(["Professores", "Gestores", "Usuários", "Saúde", "Indicadores", "Orçamentos", "Tarefas", "Modelos", "Agentes", "Configurações de modelo", "Meu perfil"]);
  });

  it("006/US7-7 Operação de IA só com ia.operacao.visualizar: um grupo com uma seção por aba, e marca a seção atual", () => {
    navigation.pathname = "/admin/ia";
    navigation.search = "aba=modelos";
    const { unmount } = renderSidebar({ me: me(PERMISSIONS.ADMIN) });
    expect(screen.getByRole("button", { name: "Operação de IA" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: "Saúde" }).getAttribute("href")).toBe("/admin/ia?aba=saude");
    expect(screen.getByRole("link", { name: "Configurações de modelo" }).getAttribute("href")).toBe("/admin/ia?aba=configuracoes");
    expect(screen.getByRole("link", { name: "Modelos" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Saúde" }).getAttribute("aria-current")).toBeNull();
    unmount();
    // Without `?aba=` the page opens Saúde.
    navigation.search = "";
    const plain = renderSidebar({ me: me(PERMISSIONS.ADMIN) });
    expect(screen.getByRole("link", { name: "Saúde" }).getAttribute("aria-current")).toBe("page");
    plain.unmount();
    for (const role of ["TEACHER", "MANAGER", "STUDENT"] as const) {
      const view = renderSidebar({ me: me(PERMISSIONS[role]) });
      expect(screen.queryByRole("button", { name: "Operação de IA" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Saúde" })).toBeNull();
      view.unmount();
    }
    renderSidebar({ me: me(PERMISSIONS.ADMIN, false) });
    expect(screen.queryByRole("button", { name: "Operação de IA" })).toBeNull();
  });

  it("o grupo Operação de IA abre e fecha, e recolhido expande o menu", async () => {
    const { container } = renderWithProviders(
      <SidebarProvider defaultOpen={false}>
        <AppSidebar me={me(PERMISSIONS.ADMIN)} />
      </SidebarProvider>,
    );
    const group = screen.getByRole("button", { name: "Operação de IA" });
    expect(group.getAttribute("aria-expanded")).toBe("false");
    const user = userEvent.setup();
    await user.click(group);
    expect(container.querySelector('[data-slot="sidebar"][data-state]')?.getAttribute("data-state")).toBe("expanded");
    expect(group.getAttribute("aria-expanded")).toBe("true");
    await user.click(group);
    expect(group.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: "Saúde" })).toBeNull();
  });

  it("marca a tela atual", () => {
    navigation.pathname = "/admin/managers";
    renderSidebar({ me: me(PERMISSIONS.ADMIN) });
    expect(screen.getByRole("link", { name: "Gestores" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Meu perfil" }).getAttribute("aria-current")).toBeNull();
  });
});
