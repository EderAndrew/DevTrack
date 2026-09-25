"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { areaFor } from "@/lib/navigation";

/** Bar at the top of the AppShell: the menu button (also Ctrl/⌘+B) and the name of the current area. */
export function Topbar() {
  const area = areaFor(usePathname());
  return (
    <header className="sticky top-0 z-(--z-sticky) flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-(--gutter)">
      <SidebarTrigger className="-ml-2 size-11" />
      {area ? <p className="m-0 truncate text-body font-semibold text-foreground">{area}</p> : null}
    </header>
  );
}
