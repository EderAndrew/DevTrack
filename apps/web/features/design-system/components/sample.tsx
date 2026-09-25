import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One showcase: marks the catalog entry it renders (`data-showcase`). */
export function Showcase({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div data-showcase={id} className="flex flex-col gap-6">
      {children}
    </div>
  );
}

/** One variant or state of a component, captioned with its name as declared in the registry. */
export function Sample({ name, className, children }: { name: string; className?: string; children: ReactNode }) {
  return (
    <figure data-sample={name} className="m-0 flex flex-col gap-2">
      <figcaption className="text-caption text-text-secondary">{name}</figcaption>
      <div className={cn("flex flex-wrap items-center gap-3", className)}>{children}</div>
    </figure>
  );
}
