import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

export interface BreadcrumbItem {
  label: string
  /** Omit for the current page, the last item. */
  href?: string
}

/** Trail (`<nav aria-label="Trilha">`); the current page has `aria-current="page"` and no link. */
function Breadcrumb({
  items,
  className,
  ...props
}: Omit<React.ComponentProps<"nav">, "children"> & { items: readonly BreadcrumbItem[] }) {
  return (
    <nav data-slot="breadcrumb" aria-label="Trilha" className={className} {...props}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-body-sm text-text-secondary">
        {items.map((item, index) => {
          const current = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
              {index > 0 ? <ChevronRight aria-hidden="true" className="size-4 shrink-0" /> : null}
              {current || !item.href ? (
                <span aria-current={current ? "page" : undefined} className={cn(current && "text-foreground")}>
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="text-primary underline-offset-4 hover:underline">
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export { Breadcrumb }
