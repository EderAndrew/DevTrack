/** The profile, which also lists the user's sessions: the start page of whoever has no area of their own. */
export const HOME_PATH = "/conta/perfil";

/** "Minhas disciplinas": the teacher's start page (004/FR-001). */
export const SUBJECTS_PATH = "/disciplinas";

/** The app root: picks the start page from the session's permissions (`startPathFor`). */
export const START_PATH = "/";

/** Start page after login: "Minhas disciplinas" for a teacher, otherwise the profile. UX only. */
export const startPathFor = (permissions: readonly string[]): string =>
  permissions.includes("disciplinas.visualizar") ? SUBJECTS_PATH : HOME_PATH;

/** "Minhas turmas" of a student (003 US7); an accepted class invitation lands here with `?bem-vindo=1`. */
export const MY_CLASSES_PATH = "/minhas-turmas";

/** User administration areas, each behind the permission its page needs (UX only; the API authorizes). */
export const USER_AREAS = [
  { href: "/professores", label: "Professores", permission: "professores.visualizar" },
  { href: "/admin/managers", label: "Gestores", permission: "managers.visualizar" },
  { href: "/admin/usuarios", label: "Usuários", permission: "usuarios.visualizar" },
] as const;

/**
 * Post-login destination: only a path of this app (`/…`), never `//host` or `/\host`, so a
 * crafted `?next=` cannot send the user to another site. Defaults to the app root, which picks
 * the account's start page.
 */
export function safeNextPath(next: string | null | undefined, fallback = START_PATH): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
