import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The design system's type scale, shadow and easing tokens (005 design-system/tokens.css).
// Without them tailwind-merge takes `text-body-sm` for a color and drops it next to
// `text-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display", "h1", "h2", "h3", "body", "body-sm", "label", "caption", "code"],
      shadow: ["overlay"],
      ease: ["standard"],
    },
    classGroups: {
      "font-size": ["text-reading"],
    },
  },
});

/** Joins class names, letting later Tailwind classes override earlier ones (shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
