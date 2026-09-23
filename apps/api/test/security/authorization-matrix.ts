import type { RoleKey } from "@repo/contracts";
import type { PermissionKey } from "../../src/modules/access-control/permissions";

/**
 * Transcribed by hand from contracts/permissions.md of specs 001 and 003 (not derived from the seed), so a drift
 * between the contract and the database breaks the tests.
 */

export type Access = "session" | PermissionKey;

export interface MatrixEntry {
  method: "GET" | "POST" | "DELETE";
  /** Route pattern as registered (without the `/api` prefix). */
  path: string;
  access: Access;
}

const PROFESSORES = [
  "professores.visualizar",
  "professores.convidar",
  "professores.reenviar_convite",
  "professores.revogar_convite",
  "professores.suspender",
  "professores.desativar",
  "professores.ativar",
] as const satisfies PermissionKey[];

const MANAGERS = [
  "managers.visualizar",
  "managers.convidar",
  "managers.reenviar_convite",
  "managers.revogar_convite",
  "managers.desativar",
  "managers.ativar",
] as const satisfies PermissionKey[];

const SESSOES = ["sessoes.proprias.listar", "sessoes.proprias.revogar"] as const satisfies PermissionKey[];

/** 003: the teacher's class permissions (MANAGER and ADMIN get none). */
const TURMAS = [
  "turmas.criar",
  "turmas.visualizar",
  "turmas.editar",
  "turmas.alterar_situacao",
  "turmas.convidar_aluno",
  "turmas.reenviar_convite",
  "turmas.cancelar_convite",
  "turmas.visualizar_alunos",
  "turmas.remover_aluno",
] as const satisfies PermissionKey[];

/** "Papéis → permissões" of the contract. */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  ADMIN: [...SESSOES, ...PROFESSORES, ...MANAGERS, "usuarios.visualizar", "usuarios.suspender", "usuarios.reativar"],
  MANAGER: [...SESSOES, ...PROFESSORES],
  TEACHER: [...SESSOES, ...TURMAS],
  STUDENT: [...SESSOES, "turmas.proprias.listar"],
};

/** Every non-public route and what it requires ("Matriz de autorização esperada"). */
export const MATRIX: readonly MatrixEntry[] = [
  { method: "GET", path: "/me", access: "session" },
  { method: "POST", path: "/auth/logout", access: "session" },
  { method: "POST", path: "/auth/logout-all", access: "session" },

  { method: "GET", path: "/me/sessions", access: "sessoes.proprias.listar" },
  { method: "GET", path: "/me/sessions/:id", access: "sessoes.proprias.listar" },
  { method: "DELETE", path: "/me/sessions/:id", access: "sessoes.proprias.revogar" },

  { method: "GET", path: "/teachers", access: "professores.visualizar" },
  { method: "GET", path: "/teachers/:userId", access: "professores.visualizar" },
  { method: "POST", path: "/teachers/:userId/suspend", access: "professores.suspender" },
  { method: "POST", path: "/teachers/:userId/deactivate", access: "professores.desativar" },
  { method: "POST", path: "/teachers/:userId/reactivate", access: "professores.ativar" },
  { method: "GET", path: "/teacher-invitations", access: "professores.visualizar" },
  { method: "POST", path: "/teacher-invitations", access: "professores.convidar" },
  { method: "POST", path: "/teacher-invitations/:id/resend", access: "professores.reenviar_convite" },
  { method: "POST", path: "/teacher-invitations/:id/revoke", access: "professores.revogar_convite" },

  { method: "GET", path: "/managers", access: "managers.visualizar" },
  { method: "POST", path: "/managers/:userId/deactivate", access: "managers.desativar" },
  { method: "POST", path: "/managers/:userId/reactivate", access: "managers.ativar" },
  { method: "GET", path: "/manager-invitations", access: "managers.visualizar" },
  { method: "POST", path: "/manager-invitations", access: "managers.convidar" },
  { method: "POST", path: "/manager-invitations/:id/resend", access: "managers.reenviar_convite" },
  { method: "POST", path: "/manager-invitations/:id/revoke", access: "managers.revogar_convite" },

  { method: "GET", path: "/users", access: "usuarios.visualizar" },
  { method: "GET", path: "/users/:id", access: "usuarios.visualizar" },
  { method: "POST", path: "/users/:id/suspend", access: "usuarios.suspender" },
  { method: "POST", path: "/users/:id/reactivate", access: "usuarios.reativar" },
];

export const routeKey = (entry: Pick<MatrixEntry, "method" | "path">) => `${entry.method} ${entry.path}`;

/** Concrete URL for an entry: random UUIDs, so an allowed call ends in 400/404 without side effects. */
export function concretePath(path: string): string {
  return `/api${path.replace(/:[A-Za-z]+/g, () => crypto.randomUUID())}`;
}
