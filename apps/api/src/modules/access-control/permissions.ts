/**
 * Permission and role keys seeded by migration `seed_roles_permissions`
 * (contracts/permissions.md). Code checks permissions, never role names (Principle II);
 * role keys are used only to grant, change or count assignments.
 */
export const PERMISSIONS = [
  "professores.convidar",
  "professores.reenviar_convite",
  "professores.revogar_convite",
  "professores.visualizar",
  "professores.suspender",
  "professores.desativar",
  "professores.ativar",
  "managers.convidar",
  "managers.reenviar_convite",
  "managers.revogar_convite",
  "managers.visualizar",
  "managers.desativar",
  "managers.ativar",
  "usuarios.visualizar",
  "usuarios.suspender",
  "usuarios.reativar",
  "sessoes.proprias.listar",
  "sessoes.proprias.revogar",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const ROLE_KEYS = ["ADMIN", "MANAGER", "TEACHER", "STUDENT"] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];
