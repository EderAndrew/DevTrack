"use client";

import type { ReactNode } from "react";
import { AppSidebar, type AppSidebarProps } from "@/components/shared/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Topbar } from "./topbar";

export interface AppShellProps extends AppSidebarProps {
  /** From the `sidebar_state` cookie, so the menu opens as the user left it. */
  defaultOpen: boolean;
  children: ReactNode;
}

/**
 * Frame of the teacher and administration screens (005 contracts/layouts.md "AppShell"): side menu
 * (collapsible to icons; a panel on narrow screens), Topbar and `<main id="conteudo">` up to
 * `--content-max`, with the `--gutter` padding.
 */
export function AppShell({ me, defaultOpen, children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar me={me} />
      <SidebarInset>
        <Topbar />
        <main id="conteudo" tabIndex={-1} className="mx-auto w-full max-w-(--content-max) flex-1 px-(--gutter) py-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
