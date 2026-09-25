import type { ReactNode } from "react";

/** A 768 px wide strip, for components that change shape at tablet width (005 US4-2). */
export function TabletFrame({ children }: { children: ReactNode }) {
  return (
    <div
      data-slot="tablet-frame"
      role="group"
      aria-label="Largura de tablet (768 px)"
      className="w-full max-w-192 overflow-x-auto rounded-md border border-dashed border-border-control p-4"
    >
      <p className="m-0 mb-3 text-caption text-text-secondary">Largura de tablet (768 px)</p>
      {children}
    </div>
  );
}

/**
 * A reduced frame for a whole layout: `transform-gpu` makes it the containing block of the fixed
 * side menu, so the layout stays inside the frame instead of covering the catalog.
 */
export function LayoutFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="relative h-96 w-full transform-gpu overflow-auto rounded-md border border-border"
    >
      {children}
    </div>
  );
}
