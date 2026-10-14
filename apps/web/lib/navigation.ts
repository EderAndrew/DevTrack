/** The profile, which also lists the user's sessions: the start page of whoever has no area of their own. */
export const HOME_PATH = "/conta/perfil";

/** "Minhas disciplinas": the teacher's start page (004/FR-001). */
export const SUBJECTS_PATH = "/disciplinas";

/** The app root: picks the start page from the session's permissions (`startPathFor`). */
export const START_PATH = "/";

/** "Painel": the student's start page (012 research P23). */
export const DASHBOARD_PATH = "/painel";

/** "Minhas atividades" of a student (012 US2). */
export const MY_ACTIVITIES_PATH = "/minhas-atividades";

/** "Histórico": the student's submitted activities (012 US6). */
export const HISTORY_PATH = "/historico";

/**
 * Start page after login: "Minhas disciplinas" for a teacher, the "Painel" for a student (who has
 * no subjects), otherwise the profile. UX only.
 */
export const startPathFor = (permissions: readonly string[]): string =>
  permissions.includes("disciplinas.visualizar")
    ? SUBJECTS_PATH
    : permissions.includes("atividades.proprias.visualizar")
      ? DASHBOARD_PATH
      : HOME_PATH;

/** "Minhas turmas" of a student (003 US7); an accepted class invitation lands here with `?bem-vindo=1`. */
export const MY_CLASSES_PATH = "/minhas-turmas";

/** User administration areas, each behind the permission its page needs (UX only; the API authorizes). */
export const USER_AREAS = [
  { href: "/professores", label: "Professores", permission: "professores.visualizar" },
  { href: "/admin/managers", label: "Gestores", permission: "managers.visualizar" },
  { href: "/admin/usuarios", label: "Usuários", permission: "usuarios.visualizar" },
] as const;

/** "Operação de IA": health, usage and cost of the AI agents, for the administrator (006 US7). */
export const AI_OPERATIONS_AREA = { href: "/admin/ia", label: "Operação de IA", permission: "ia.operacao.visualizar" } as const;

/**
 * Permissions of the teacher and administration areas: a verified user with any of them works in
 * the AppShell, otherwise in the student layout (005 contracts/layouts.md). UX only.
 */
export const STAFF_AREA_PERMISSIONS: readonly string[] = [
  "disciplinas.visualizar",
  "turmas.visualizar",
  ...USER_AREAS.map((area) => area.permission),
  AI_OPERATIONS_AREA.permission,
];

/** Route prefix → name of the area, shown in the Topbar (005 research V12, V20). */
export const AREAS = [
  { prefix: "/disciplinas", name: "Minhas disciplinas" },
  { prefix: "/exercicios", name: "Banco de Exercícios" },
  { prefix: "/trabalhos", name: "Banco de Trabalhos" },
  { prefix: "/provas", name: "Banco de Provas" },
  { prefix: "/turmas", name: "Turmas" },
  { prefix: "/professores", name: "Professores" },
  { prefix: "/admin/managers", name: "Gestores" },
  { prefix: "/admin/usuarios", name: "Usuários" },
  { prefix: AI_OPERATIONS_AREA.href, name: AI_OPERATIONS_AREA.label },
  { prefix: "/conta", name: "Minha conta" },
  { prefix: MY_CLASSES_PATH, name: "Minhas turmas" },
  { prefix: DASHBOARD_PATH, name: "Painel" },
  { prefix: MY_ACTIVITIES_PATH, name: "Minhas atividades" },
  { prefix: HISTORY_PATH, name: "Histórico" },
] as const;

/** Name of the area a path belongs to (the prefix itself or a page below it), or `null`. */
export function areaFor(pathname: string): string | null {
  const area = AREAS.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return area?.name ?? null;
}

/**
 * Post-login destination: only a path of this app (`/…`), never `//host` or `/\host`, so a
 * crafted `?next=` cannot send the user to another site. Defaults to the app root, which picks
 * the account's start page.
 */
export function safeNextPath(next: string | null | undefined, fallback = START_PATH): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
