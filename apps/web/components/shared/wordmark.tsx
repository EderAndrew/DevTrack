import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  /** Login and password screens. */
  lg: "text-wordmark tracking-tight",
  /** Side menus and the public header. */
  md: "text-h3",
} as const;

/**
 * The DevTrack wordmark: Fredoka (`font-brand`, only here), "Dev" in `--primary` and "Track" in
 * `--brand-secondary`. Its text is exactly "DevTrack", so a link around it keeps that name.
 */
export function Wordmark({ size = "md", className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span className={cn("font-brand font-semibold", SIZES[size], className)}>
      <span className="text-primary">Dev</span>
      <span className="text-brand-secondary">Track</span>
    </span>
  );
}

/** The "D" a collapsed side menu shows in place of the wordmark (hidden from screen readers by the caller). */
export function WordmarkInitial({ className, ...props }: ComponentProps<"span">) {
  return (
    <span className={cn("font-brand font-semibold text-h3 text-primary", className)} {...props}>
      D
    </span>
  );
}
