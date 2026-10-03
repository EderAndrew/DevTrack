"use client";

import type { MeView } from "@repo/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/shared/logout-button";
import { cn } from "@/lib/utils";
import { DASHBOARD_PATH, HISTORY_PATH, HOME_PATH, MY_ACTIVITIES_PATH, MY_CLASSES_PATH } from "@/lib/navigation";

const CONTENT = "mx-auto w-full max-w-240 flex-1 px-(--gutter) py-6";

export interface StudentLayoutProps {
  me: Pick<MeView, "emailVerified" | "permissions"> | null;
  /** Catalog only: the content goes in a `div` (the page already has its `main#conteudo`). */
  preview?: boolean;
  children: ReactNode;
}

/**
 * Frame of the student screens (005 contracts/layouts.md "StudentLayout"): a top bar with the
 * brand, the student menu and "Sair", and the content at reading width. No side menu and no
 * teacher or administration item: Painel, Minhas atividades, Histórico (012), Minhas turmas and Meu perfil,
 * each behind the permission its page needs (UX only; the API authorizes).
 */
export function StudentLayout({ me, preview = false, children }: StudentLayoutProps) {
  const pathname = usePathname();
  const can = (permission: string) => Boolean(me?.emailVerified && me.permissions.includes(permission));
  const ownActivities = can("atividades.proprias.visualizar");
  const items = [
    ...(ownActivities
      ? [
          { href: DASHBOARD_PATH, label: "Painel" },
          { href: MY_ACTIVITIES_PATH, label: "Minhas atividades" },
          { href: HISTORY_PATH, label: "Histórico" },
        ]
      : []),
    ...(can("turmas.proprias.listar") ? [{ href: MY_CLASSES_PATH, label: "Minhas turmas" }] : []),
    { href: HOME_PATH, label: "Meu perfil" },
  ];

  return (
    <div className={cn("flex flex-col bg-background", !preview && "min-h-svh")}>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-240 flex-wrap items-center gap-x-6 gap-y-2 px-(--gutter) py-2">
          <Link href="/" className="text-h3 font-bold text-foreground no-underline">
            DevTrack
          </Link>
          <nav aria-label="Menu do aluno" className="flex-1">
            <ul className="m-0 flex list-none flex-wrap gap-x-1 gap-y-1 p-0">
              {items.map((item) => {
                const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "inline-flex min-h-11 items-center rounded-md px-3 text-body text-foreground no-underline hover:bg-accent hover:text-accent-foreground",
                        current && "font-semibold text-primary underline decoration-2 underline-offset-8",
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <LogoutButton />
        </div>
      </header>
      {preview ? (
        <div className={CONTENT}>{children}</div>
      ) : (
        <main id="conteudo" tabIndex={-1} className={CONTENT}>
          {children}
        </main>
      )}
    </div>
  );
}
