import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y";
import { expectTabOrder } from "../../test/keyboard";
import { renderWithProviders } from "../../test/render";
import { Button } from "@/components/ui/button";
import { StudentLayout, type StudentLayoutProps } from "./student-layout";

// 005 US5 (FR-024; contracts/layouts.md "StudentLayout", amended 2026-10-03: the AppShell's side
// menu with only the student's items; research V13).

const navigation = vi.hoisted(() => ({ pathname: "/minhas-turmas" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const STUDENT = [
  "sessoes.proprias.listar",
  "sessoes.proprias.revogar",
  "turmas.proprias.listar",
  // 012 (seeded for STUDENT).
  "atividades.proprias.visualizar",
  "atividades.proprias.responder",
  "notas.proprias.visualizar",
];

const me = (permissions: string[], emailVerified = true): StudentLayoutProps["me"] => ({
  name: "Bruno Lima",
  emailVerified,
  permissions,
});

let mobile = false;

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

  it("menu lateral com a marca, os itens do aluno, o nome e Sair; barra superior com o botão do menu; área principal", async () => {
    const { container } = renderLayout();
    expect(screen.getByRole("link", { name: "DevTrack" }).getAttribute("href")).toBe("/");
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
    expect(screen.getByText("Bruno Lima")).toBeTruthy();
    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("button", { name: "Abrir ou fechar o menu" })).toBeTruthy();
    expect(within(banner).getByText("Minhas turmas")).toBeTruthy();
    expect(banner.contains(studentMenu())).toBe(false);
    const links = within(studentMenu()).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Painel", "Minhas atividades", "Histórico", "Minhas turmas", "Meu perfil"]);
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

  it("sem itens nem menu de professor ou administração", () => {
    const { container } = renderLayout();
    expect(screen.queryByRole("navigation", { name: "Menu principal" })).toBeNull();
    expect(container.textContent).not.toMatch(/Professores|Gestores|Usuários|disciplinas|Operação de IA|Banco de/);
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

  it("012/US2 Painel e Minhas atividades com a permissão; a página de uma atividade marca Minhas atividades", () => {
    navigation.pathname = "/minhas-atividades/0f3c4b8e-1a2b-4c5d-8e9f-0a1b2c3d4e5f";
    renderLayout();
    expect(within(studentMenu()).getByRole("link", { name: "Minhas atividades" }).getAttribute("aria-current")).toBe("page");
    expect(within(studentMenu()).getByRole("link", { name: "Painel" }).getAttribute("href")).toBe("/painel");
    expect(within(studentMenu()).getByRole("link", { name: "Histórico" }).getAttribute("href")).toBe("/historico");
    renderLayout({ me: me(STUDENT.filter((permission) => permission !== "atividades.proprias.visualizar")) });
    const menus = screen.getAllByRole("navigation", { name: "Menu do aluno" });
    expect(within(menus.at(-1)!).getAllByRole("link").map((link) => link.textContent)).toEqual(["Minhas turmas", "Meu perfil"]);
  });

  it("020/US1-5 020/SC-006 \"Enviar feedback\" no rodapé do menu com feedbacks.enviar, também na página de uma atividade", () => {
    const feedback = <Button type="button">Enviar feedback</Button>;
    navigation.pathname = "/minhas-atividades/0f3c4b8e-1a2b-4c5d-8e9f-0a1b2c3d4e5f";
    renderLayout({ me: me([...STUDENT, "feedbacks.enviar"]), feedback });
    expect(screen.getByRole("button", { name: "Enviar feedback" })).toBeTruthy();
    expect(studentMenu().contains(screen.getByRole("button", { name: "Enviar feedback" }))).toBe(false);
  });

  it("020/US1-5 020/SC-006 sem feedbacks.enviar ou sem e-mail confirmado, sem \"Enviar feedback\"", () => {
    const feedback = <Button type="button">Enviar feedback</Button>;
    renderLayout({ me: me(STUDENT), feedback });
    expect(screen.queryByRole("button", { name: "Enviar feedback" })).toBeNull();
    renderLayout({ me: me([...STUDENT, "feedbacks.enviar"], false), feedback });
    expect(screen.queryByRole("button", { name: "Enviar feedback" })).toBeNull();
  });

  it("conteúdo na largura de leitura", () => {
    renderLayout();
    expect(screen.getByRole("main").getAttribute("class")).toMatch(/\bmax-w-240\b/);
    expect(screen.getByRole("main").getAttribute("class")).toContain("has-[>[data-layout=wide]]:max-w-none");
  });

  it("recolhido só com ícones e nomes acessíveis; a escolha fica no cookie sidebar_state", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole("button", { name: "Abrir ou fechar o menu" }));
    expect(document.cookie).toMatch(/sidebar_state=false/);
    expect(within(studentMenu()).getByRole("link", { name: "Histórico" })).toBeTruthy();
  });

  it("em tela estreita o menu abre e fecha como painel", async () => {
    mobile = true;
    const user = userEvent.setup();
    renderLayout();
    expect(screen.queryByRole("navigation", { name: "Menu do aluno" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Abrir ou fechar o menu" }));
    const panel = screen.getByRole("dialog", { name: "Menu" });
    expect(within(panel).getByRole("navigation", { name: "Menu do aluno" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("em tela estreita, um Escape com o foco num item do menu fecha o painel", async () => {
    mobile = true;
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole("button", { name: "Abrir ou fechar o menu" }));
    const panel = screen.getByRole("dialog", { name: "Menu" });
    within(panel).getByRole("link", { name: "Histórico" }).focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ordem de tabulação: marca, menu, Sair, botão do menu e conteúdo", async () => {
    const user = userEvent.setup();
    renderLayout();
    await expectTabOrder(user, [
      screen.getByRole("link", { name: "DevTrack" }),
      screen.getByRole("link", { name: "Painel" }),
      screen.getByRole("link", { name: "Minhas atividades" }),
      screen.getByRole("link", { name: "Histórico" }),
      screen.getByRole("link", { name: "Minhas turmas" }),
      screen.getByRole("link", { name: "Meu perfil" }),
      screen.getByRole("button", { name: "Sair" }),
      screen.getByRole("button", { name: "Abrir ou fechar o menu" }),
    ]);
  });
});
