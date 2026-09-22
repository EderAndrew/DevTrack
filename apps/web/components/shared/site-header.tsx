import Link from "next/link";
import type { ReactNode } from "react";

export interface SiteHeaderProps {
  /** The navigation (`SiteNav`). */
  children: ReactNode;
}

/** Header of the public screens; the signed-in screens use the side menu instead. */
export function SiteHeader({ children }: SiteHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
      <Link href="/" className="font-bold text-foreground no-underline">
        DevTrack
      </Link>
      {children}
    </header>
  );
}
