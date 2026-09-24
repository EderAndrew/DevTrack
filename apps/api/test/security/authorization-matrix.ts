import type { RoleKey } from "@repo/contracts";
import type { PermissionKey } from "../../src/modules/access-control/permissions";

/**
 * Transcribed by hand from contracts/permissions.md of specs 001, 003 and 004 (not derived from the seed), so a drift
 * between the contract and the database breaks the tests.
 */

export type Access = "session" | PermissionKey;

export interface MatrixEntry {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Route pattern as registered (without the `/api` prefix). */
  path: string;
  access: Access;
  /** `multipart/form-data` route (004): the matrix sends a small file instead of a JSON body. */
  upload?: true;
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

/** 004: subjects, syllabus, calendar and class plan — TEACHER only (MANAGER and ADMIN get none). */
export const CURRICULUM = [
  "disciplinas.visualizar",
  "disciplinas.criar",
  "disciplinas.editar",
  "ementas.enviar",
  "ementas.visualizar",
  "ementas.revisar",
  "calendario.gerenciar",
  "planejamento.visualizar",
  "planejamento.editar",
  "planejamento.alterar_situacao",
] as const satisfies PermissionKey[];

/** "Papéis → permissões" of the contract. */
export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  ADMIN: [...SESSOES, ...PROFESSORES, ...MANAGERS, "usuarios.visualizar", "usuarios.suspender", "usuarios.reativar"],
  MANAGER: [...SESSOES, ...PROFESSORES],
  TEACHER: [...SESSOES, ...TURMAS, ...CURRICULUM],
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

  { method: "GET", path: "/classes", access: "turmas.visualizar" },
  { method: "POST", path: "/classes", access: "turmas.criar" },
  { method: "GET", path: "/classes/:id", access: "turmas.visualizar" },
  { method: "PATCH", path: "/classes/:id", access: "turmas.editar" },
  { method: "POST", path: "/classes/:id/status", access: "turmas.alterar_situacao" },
  { method: "GET", path: "/classes/:id/invitations", access: "turmas.visualizar" },
  { method: "POST", path: "/classes/:id/invitations", access: "turmas.convidar_aluno" },
  { method: "POST", path: "/classes/:id/invitations/:invitationId/resend", access: "turmas.reenviar_convite" },
  { method: "POST", path: "/classes/:id/invitations/:invitationId/cancel", access: "turmas.cancelar_convite" },
  { method: "GET", path: "/classes/:id/enrollments", access: "turmas.visualizar_alunos" },
  { method: "POST", path: "/classes/:id/enrollments/:enrollmentId/remove", access: "turmas.remover_aluno" },
  { method: "GET", path: "/me/classes", access: "turmas.proprias.listar" },

  { method: "GET", path: "/subjects", access: "disciplinas.visualizar" },
  { method: "POST", path: "/subjects", access: "disciplinas.criar" },
  { method: "GET", path: "/subjects/:id", access: "disciplinas.visualizar" },
  { method: "PATCH", path: "/subjects/:id", access: "disciplinas.editar" },
  { method: "POST", path: "/subjects/:id/status", access: "disciplinas.editar" },

  { method: "GET", path: "/subjects/:id/syllabus-documents", access: "ementas.visualizar" },
  { method: "POST", path: "/subjects/:id/syllabus-documents", access: "ementas.enviar", upload: true },
  { method: "GET", path: "/syllabus-documents/:id", access: "ementas.visualizar" },
  { method: "GET", path: "/syllabus-documents/:id/file", access: "ementas.visualizar" },
  { method: "POST", path: "/syllabus-documents/:id/retry", access: "ementas.enviar" },
  { method: "POST", path: "/syllabus-documents/:id/revisions", access: "ementas.revisar" },
  { method: "GET", path: "/syllabus-revisions/:id", access: "ementas.visualizar" },
  { method: "PUT", path: "/syllabus-revisions/:id", access: "ementas.revisar" },
  { method: "POST", path: "/syllabus-revisions/:id/confirm", access: "ementas.revisar" },

  { method: "GET", path: "/classes/:id/meetings", access: "planejamento.visualizar" },
  { method: "PUT", path: "/classes/:id/meetings", access: "calendario.gerenciar" },

  { method: "GET", path: "/classes/:id/plan", access: "planejamento.visualizar" },
  { method: "PUT", path: "/classes/:id/plan/syllabus", access: "planejamento.editar" },
  { method: "GET", path: "/classes/:id/plan/coverage", access: "planejamento.visualizar" },
  { method: "POST", path: "/classes/:id/plan/topics", access: "planejamento.editar" },
];

export const routeKey = (entry: Pick<MatrixEntry, "method" | "path">) => `${entry.method} ${entry.path}`;

/** Concrete URL for an entry: random UUIDs, so an allowed call ends in 400/404 without side effects. */
export function concretePath(path: string): string {
  return `/api${path.replace(/:[A-Za-z]+/g, () => crypto.randomUUID())}`;
}
