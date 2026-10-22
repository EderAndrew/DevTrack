import Link from "next/link";
import type { ReactNode } from "react";
import { BetaBadge } from "./beta-badge";
import { Wordmark } from "./wordmark";

export interface SiteHeaderProps {
  /** The navigation (`SiteNav`). */
  children: ReactNode;
}

/** Header of the public screens; the signed-in screens use the side menu instead. */
export function SiteHeader({ children }: SiteHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
      <span className="flex items-center gap-2">
        <Link href="/" className="no-underline">
          <Wordmark />
        </Link>
        <BetaBadge />
      </span>
      {children}
    </header>
  );
}
