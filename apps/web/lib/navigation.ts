/** Start page of a signed-in user: the profile, which also lists the user's sessions. */
export const HOME_PATH = "/conta/perfil";

/** User administration areas, each behind the permission its page needs (UX only; the API authorizes). */
export const USER_AREAS = [
  { href: "/professores", label: "Professores", permission: "professores.visualizar" },
  { href: "/admin/managers", label: "Gestores", permission: "managers.visualizar" },
  { href: "/admin/usuarios", label: "Usuários", permission: "usuarios.visualizar" },
] as const;

/**
 * Post-login destination: only a path of this app (`/…`), never `//host` or `/\host`, so a
 * crafted `?next=` cannot send the user to another site. Defaults to the profile page.
 */
export function safeNextPath(next: string | null | undefined, fallback = HOME_PATH): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
