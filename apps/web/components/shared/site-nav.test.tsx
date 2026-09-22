import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../test/a11y";
import { renderWithProviders } from "../../test/render";
import { SiteNav } from "./site-nav";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

/** Same sets as apps/api/test/security/authorization-matrix.ts (contracts/permissions.md). */
const SESSOES = ["sessoes.proprias.listar", "sessoes.proprias.revogar"];
const PROFESSORES = [
  "professores.visualizar",
  "professores.convidar",
  "professores.reenviar_convite",
  "professores.revogar_convite",
  "professores.suspender",
  "professores.desativar",
  "professores.ativar",
];
const MANAGERS = ["managers.visualizar", "managers.convidar", "managers.reenviar_convite", "managers.revogar_convite", "managers.desativar", "managers.ativar"];
const ROLE_PERMISSIONS = {
  STUDENT: SESSOES,
  TEACHER: SESSOES,
  MANAGER: [...SESSOES, ...PROFESSORES],
  ADMIN: [...SESSOES, ...PROFESSORES, ...MANAGERS, "usuarios.visualizar", "usuarios.suspender", "usuarios.reativar"],
};

const links = () => screen.queryAllByRole("link").map((link) => link.textContent);

describe("SiteNav (UX only)", () => {
  it("anônimo: só entrar (sem link de cadastro)", async () => {
    const { container } = renderWithProviders(<SiteNav me={null} />);
    expect(links()).toEqual(["Entrar"]);
    expect(screen.queryByRole("button", { name: "Sair" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it.each([
    ["STUDENT", ["Meu perfil"]],
    ["TEACHER", ["Meu perfil"]],
    ["MANAGER", ["Professores", "Meu perfil"]],
    ["ADMIN", ["Professores", "Gestores", "Usuários", "Meu perfil"]],
  ] as const)("%s vê exatamente %j", async (role, expected) => {
    const { container } = renderWithProviders(<SiteNav me={{ emailVerified: true, permissions: ROLE_PERMISSIONS[role] }} />);
    expect(links()).toEqual(expected);
    expect(screen.getByRole("button", { name: "Sair" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("e-mail não verificado não vê áreas administrativas, mesmo com permissões", () => {
    renderWithProviders(<SiteNav me={{ emailVerified: false, permissions: ROLE_PERMISSIONS.ADMIN }} />);
    expect(links()).toEqual(["Meu perfil"]);
  });
});
