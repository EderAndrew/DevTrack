import type { MeView } from "@repo/contracts";

/** Fixed sample users for the layouts in the catalog (no request is made). */
type NavigationUser = Pick<MeView, "name" | "emailVerified" | "permissions">;

const SESSIONS = ["sessoes.proprias.listar", "sessoes.proprias.revogar"];

export const SAMPLE_TEACHER: NavigationUser = {
  name: "Ana Souza",
  emailVerified: true,
  permissions: [...SESSIONS, "disciplinas.visualizar", "turmas.visualizar", "turmas.criar"],
};

export const SAMPLE_ADMIN: NavigationUser = {
  name: "Rafael Costa",
  emailVerified: true,
  permissions: [...SESSIONS, "professores.visualizar", "managers.visualizar", "usuarios.visualizar"],
};

export const SAMPLE_STUDENT: NavigationUser = {
  name: "Bruno Lima",
  emailVerified: true,
  permissions: [...SESSIONS, "turmas.proprias.listar"],
};
