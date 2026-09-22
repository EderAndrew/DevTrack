import { RoleKeySchema } from "@repo/contracts";

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

/** Seeded roles; the values and the `RoleKey` type come from the contract (002 T034). */
export const ROLE_KEYS = RoleKeySchema.options;
