"use client";

import type { ReactNode } from "react";
import { AppSidebar, type AppSidebarProps } from "@/components/shared/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Topbar } from "./topbar";

export interface AppShellProps extends AppSidebarProps {
  /** From the `sidebar_state` cookie, so the menu opens as the user left it. */
  defaultOpen: boolean;
  /** Catalog only: the content goes in a `div` (the page already has its `main#conteudo`). */
  preview?: boolean;
  children: ReactNode;
}

/**
 * Frame of the teacher and administration screens (005 contracts/layouts.md "AppShell"): side menu
 * (collapsible to icons; a panel on narrow screens), Topbar and `<main id="conteudo">` up to
 * `--content-max`, with the `--gutter` padding. A page whose root has `data-layout="wide"` (wide
 * tables, such as "Operação de IA") takes the whole width instead.
 */
export function AppShell({ me, defaultOpen, preview = false, children }: AppShellProps) {
  const content = "mx-auto w-full max-w-(--content-max) flex-1 px-(--gutter) py-6 has-[>[data-layout=wide]]:max-w-none";
  return (
    <SidebarProvider defaultOpen={defaultOpen} className={preview ? "min-h-0" : undefined}>
      <AppSidebar me={me} />
      <SidebarInset>
        <Topbar />
        {preview ? (
          <div className={content}>{children}</div>
        ) : (
          <main id="conteudo" tabIndex={-1} className={content}>
            {children}
          </main>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
