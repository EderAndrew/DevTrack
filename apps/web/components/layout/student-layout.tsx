"use client";

import type { MeView } from "@repo/contracts";
import { BookOpen, History, LayoutDashboard, ListTodo, type LucideIcon, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/shared/logout-button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { DASHBOARD_PATH, HISTORY_PATH, HOME_PATH, MY_ACTIVITIES_PATH, MY_CLASSES_PATH } from "@/lib/navigation";
import { Topbar } from "./topbar";

/** Up to 960 px; a page whose root has `data-layout="wide"` (the dashboard) takes the whole width, keeping the `--gutter`. */
const CONTENT = "mx-auto w-full max-w-240 flex-1 px-(--gutter) py-6 has-[>[data-layout=wide]]:max-w-none";
const LINK = "text-sidebar-foreground no-underline";

export interface StudentLayoutProps {
  me: (Pick<MeView, "emailVerified" | "permissions"> & Partial<Pick<MeView, "name">>) | null;
  /** From the `sidebar_state` cookie, so the menu opens as the user left it (default open). */
  defaultOpen?: boolean;
  /** Catalog only: the content goes in a `div` (the page already has its `main#conteudo`). */
  preview?: boolean;
  children: ReactNode;
}

interface StudentItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Frame of the student screens (005 contracts/layouts.md "StudentLayout", amended 2026-10-03): the
 * same side menu as the AppShell (collapsible to icons; a panel on narrow screens) with only the
 * student's items — Painel, Minhas atividades and Histórico (012), Minhas turmas and Meu perfil,
 * each behind the permission its page needs (UX only; the API authorizes) — the Topbar, and the
 * content at reading width. No teacher or administration item.
 */
export function StudentLayout({ me, defaultOpen = true, preview = false, children }: StudentLayoutProps) {
  const pathname = usePathname();
  const can = (permission: string) => Boolean(me?.emailVerified && me.permissions.includes(permission));
  const items: StudentItem[] = [
    ...(can("atividades.proprias.visualizar")
      ? [
          { href: DASHBOARD_PATH, label: "Painel", icon: LayoutDashboard },
          { href: MY_ACTIVITIES_PATH, label: "Minhas atividades", icon: ListTodo },
          { href: HISTORY_PATH, label: "Histórico", icon: History },
        ]
      : []),
    ...(can("turmas.proprias.listar") ? [{ href: MY_CLASSES_PATH, label: "Minhas turmas", icon: BookOpen }] : []),
    { href: HOME_PATH, label: "Meu perfil", icon: UserRound },
  ];

  return (
    <SidebarProvider defaultOpen={defaultOpen} className={preview ? "min-h-0" : undefined}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link href="/" className={`${LINK} px-2 py-1 text-h3 font-bold`}>
            <span className="group-data-[collapsible=icon]:sr-only">DevTrack</span>
            <span aria-hidden="true" className="hidden group-data-[collapsible=icon]:inline">
              D
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Menu do aluno">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map(({ href, label, icon: Icon }) => {
                    const current = pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <SidebarMenuItem key={href}>
                        <SidebarMenuButton asChild isActive={current} tooltip={label}>
                          <Link href={href} className={LINK} aria-current={current ? "page" : undefined}>
                            <Icon aria-hidden="true" />
                            <span>{label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
        <SidebarFooter>
          {me?.name ? <p className="m-0 truncate px-2 text-body-sm group-data-[collapsible=icon]:sr-only">{me.name}</p> : null}
          <div className="px-2 group-data-[collapsible=icon]:px-0">
            <LogoutButton className="group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:[&>span]:sr-only" />
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <Topbar />
        {preview ? (
          <div className={CONTENT}>{children}</div>
        ) : (
          <main id="conteudo" tabIndex={-1} className={CONTENT}>
            {children}
          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
