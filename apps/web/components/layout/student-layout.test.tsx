import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y";
import { expectTabOrder } from "../../test/keyboard";
import { renderWithProviders } from "../../test/render";
import { StudentLayout, type StudentLayoutProps } from "./student-layout";

// 005 US5 (FR-024; contracts/layouts.md "StudentLayout"; research V13).

const navigation = vi.hoisted(() => ({ pathname: "/minhas-turmas" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const STUDENT = ["sessoes.proprias.listar", "sessoes.proprias.revogar", "turmas.proprias.listar"];

const me = (permissions: string[], emailVerified = true): StudentLayoutProps["me"] => ({
  emailVerified,
  permissions,
});

function renderLayout(props: Partial<StudentLayoutProps> = {}) {
  return renderWithProviders(
    <StudentLayout me={me(STUDENT)} {...props}>
      <h1>Minhas turmas</h1>
    </StudentLayout>,
  );
}

const studentMenu = () => screen.getByRole("navigation", { name: "Menu do aluno" });

describe("005/US5-1 layout do aluno", () => {
  beforeEach(() => {
    navigation.pathname = "/minhas-turmas";
  });

  it("barra com a marca, menu do aluno, Sair e a área principal", async () => {
    const { container } = renderLayout();
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: "DevTrack" }).getAttribute("href")).toBe("/");
    expect(banner.contains(studentMenu())).toBe(true);
    expect(within(banner).getByRole("button", { name: "Sair" })).toBeTruthy();
    const links = within(studentMenu()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Minhas turmas", "Meu perfil"]);
    const main = screen.getByRole("main");
    expect(main.id).toBe("conteudo");
    expect(main.getAttribute("tabindex")).toBe("-1");
    expect(main.contains(banner)).toBe(false);
    expect(within(main).getByRole("heading", { level: 1, name: "Minhas turmas" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("marca a tela atual com aria-current", () => {
    renderLayout();
    expect(within(studentMenu()).getByRole("link", { name: "Minhas turmas" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(within(studentMenu()).getByRole("link", { name: "Meu perfil" }).getAttribute("aria-current")).toBeNull();
    navigation.pathname = "/conta/perfil";
    renderLayout();
    const menus = screen.getAllByRole("navigation", { name: "Menu do aluno" });
    expect(within(menus.at(-1)!).getByRole("link", { name: "Meu perfil" }).getAttribute("aria-current")).toBe("page");
  });

  it("sem menu lateral nem itens de professor ou administração", () => {
    const { container } = renderLayout();
    expect(screen.queryByRole("navigation", { name: "Menu principal" })).toBeNull();
    expect(container.querySelector('[data-slot="sidebar"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Professores|Gestores|Usuários|disciplinas/);
    expect(within(studentMenu()).queryByRole("link", { name: /disciplinas|^Turmas$/ })).toBeNull();
  });

  it("sem e-mail confirmado, só o perfil fica no menu", () => {
    renderLayout({ me: me(STUDENT, false) });
    expect(
      within(studentMenu())
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Meu perfil"]);
  });

  it("conteúdo na largura de leitura", () => {
    renderLayout();
    expect(screen.getByRole("main").getAttribute("class")).toMatch(/\bmax-w-240\b/);
  });

  it("ordem de tabulação: marca, menu, Sair e conteúdo", async () => {
    const user = userEvent.setup();
    renderLayout();
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "DevTrack" }),
      screen.getByRole("link", { name: "Minhas turmas" }),
      screen.getByRole("link", { name: "Meu perfil" }),
      screen.getByRole("button", { name: "Sair" }),
    ]);
  });
});
