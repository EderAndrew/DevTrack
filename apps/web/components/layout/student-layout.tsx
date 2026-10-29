"use client";

import type { MeView } from "@repo/contracts";
import { BookOpen, History, LayoutDashboard, ListTodo, type LucideIcon, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BetaBadge } from "@/components/shared/beta-badge";
import { Wordmark, WordmarkInitial } from "@/components/shared/wordmark";
import { NavUser } from "@/components/shared/nav-user";
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
import { DASHBOARD_PATH, HISTORY_PATH, MY_ACTIVITIES_PATH, MY_CLASSES_PATH, MY_FEEDBACKS_PATH } from "@/lib/navigation";
import { Topbar } from "./topbar";

/** Up to 960 px; a page whose root has `data-layout="wide"` (the dashboard) takes the whole width, keeping the `--gutter`. */
const CONTENT = "mx-auto w-full max-w-240 flex-1 px-(--gutter) py-6 has-[>[data-layout=wide]]:max-w-none";
const LINK = "text-sidebar-foreground no-underline";

export interface StudentLayoutProps {
  me: (Pick<MeView, "emailVerified" | "permissions"> & Partial<Pick<MeView, "name" | "email">>) | null;
  /** From the `sidebar_state` cookie, so the menu opens as the user left it (default open). */
  defaultOpen?: boolean;
  /** Catalog only: the content goes in a `div` (the page already has its `main#conteudo`). */
  preview?: boolean;
  /** 020: the "Enviar feedback" button (from `features/feedback`), shown with `feedbacks.enviar`. */
  feedback?: ReactNode;
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
 * student's items — Painel, Minhas atividades and Histórico (012), Minhas turmas and Meus feedbacks (020),
 * each behind the permission its page needs (UX only; the API authorizes) — the Topbar, and the
 * content at reading width; "Meu perfil" and "Sair" are in the user menu of the footer. No teacher or administration item. "Enviar feedback" (020) sits at the
 * bottom of the menu; the focus layout of exams and CONTROLLED works has no menu, so no feedback.
 */
export function StudentLayout({ me, defaultOpen = true, preview = false, feedback, children }: StudentLayoutProps) {
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
    ...(can("feedbacks.proprios.listar") ? [{ href: MY_FEEDBACKS_PATH, label: "Meus feedbacks", icon: MessagesSquare }] : []),
  ];

  return (
    <SidebarProvider defaultOpen={defaultOpen} className={preview ? "min-h-0" : undefined}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="flex-row items-center gap-2">
          <Link href="/" className={`${LINK} px-2 py-1`}>
            <Wordmark className="group-data-[collapsible=icon]:sr-only" />
            <WordmarkInitial className="hidden group-data-[collapsible=icon]:inline" aria-hidden="true" />
          </Link>
          <BetaBadge className="group-data-[collapsible=icon]:hidden" />
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
          {feedback && can("feedbacks.enviar") ? <div className="px-2 group-data-[collapsible=icon]:px-0">{feedback}</div> : null}
          <NavUser name={me?.name} email={me?.email} />
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
