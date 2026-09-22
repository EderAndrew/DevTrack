import Link from "next/link";
import type { MeView } from "@repo/contracts";
import { HOME_PATH, USER_AREAS } from "@/lib/navigation";
import { LogoutButton } from "./logout-button";

/** Links keep a 44px target size (FR-075). */
const NAV = "flex items-center gap-4 [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center";


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
      <nav aria-label="Conta" className={NAV}>
        <Link href="/entrar">Entrar</Link>
      </nav>
    );
  }

  const areas = me.emailVerified ? USER_AREAS.filter((area) => me.permissions.includes(area.permission)) : [];
  return (
    <nav aria-label="Conta" className={NAV}>
      {areas.map((area) => (
        <Link key={area.href} href={area.href}>
          {area.label}
        </Link>
      ))}
      <Link href={HOME_PATH}>Meu perfil</Link>
      <LogoutButton />
    </nav>
  );
}
