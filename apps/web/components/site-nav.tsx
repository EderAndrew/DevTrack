import Link from "next/link";
import type { MeView } from "../lib/session";
import { LogoutButton } from "./logout-button";

/** Areas shown in the header, each behind the permission its page needs (UX only; the API authorizes). */
const AREAS = [
  { href: "/professores", label: "Professores", permission: "professores.visualizar" },
  { href: "/admin/managers", label: "Gestores", permission: "managers.visualizar" },
  { href: "/admin/usuarios", label: "Usuários", permission: "usuarios.visualizar" },
] as const;

export interface SiteNavProps {
  me: Pick<MeView, "emailVerified" | "permissions"> | null;
}

/**
 * Account navigation. An unverified e-mail sees no administrative area: every such route
 * would answer EMAIL_NOT_VERIFIED (FR-016).
 */
export function SiteNav({ me }: SiteNavProps) {
  if (!me) {
    return (
      <nav aria-label="Conta" className="site-nav">
        <Link href="/entrar">Entrar</Link>
        <Link href="/cadastro">Criar conta</Link>
      </nav>
    );
  }

  const areas = me.emailVerified ? AREAS.filter((area) => me.permissions.includes(area.permission)) : [];
  return (
    <nav aria-label="Conta" className="site-nav">
      {areas.map((area) => (
        <Link key={area.href} href={area.href}>
          {area.label}
        </Link>
      ))}
      <Link href="/conta/sessoes">Minhas sessões</Link>
      <LogoutButton />
    </nav>
  );
}
