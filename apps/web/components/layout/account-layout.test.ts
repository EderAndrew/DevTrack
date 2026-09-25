import { describe, expect, it } from "vitest";
import { accountLayoutFor } from "./account-layout";

// 005 US5-2, US5-3 (FR-024; contracts/layouts.md "Escolha do layout de conta"; research V13).

const SESSOES = ["sessoes.proprias.listar", "sessoes.proprias.revogar"];
const STUDENT = [...SESSOES, "turmas.proprias.listar"];
const TEACHER = [...SESSOES, "turmas.criar", "turmas.visualizar", "disciplinas.visualizar"];
const MANAGER = [...SESSOES, "professores.visualizar"];
const ADMIN = [...SESSOES, "professores.visualizar", "managers.visualizar", "usuarios.visualizar"];

const me = (permissions: string[], emailVerified = true) => ({ emailVerified, permissions });

describe("005/US5-2 005/US5-3 accountLayoutFor escolhe o layout pelas permissões do menu", () => {
  it.each([
    ["professor", TEACHER],
    ["gestor", MANAGER],
    ["administrador", ADMIN],
    ["professor que também é aluno", [...TEACHER, "turmas.proprias.listar"]],
    ["só disciplinas", [...SESSOES, "disciplinas.visualizar"]],
    ["só usuários", [...SESSOES, "usuarios.visualizar"]],
  ])("%s → AppShell", (_who, permissions) => {
    expect(accountLayoutFor(me(permissions))).toBe("app-shell");
  });

  it.each([
    ["aluno", me(STUDENT)],
    ["conta só com sessões", me(SESSOES)],
    ["professor com e-mail não verificado", me(TEACHER, false)],
    ["sem sessão", null],
  ])("%s → layout do aluno", (_who, user) => {
    expect(accountLayoutFor(user)).toBe("student");
  });
});
