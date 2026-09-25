"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Pages shown around the current one; the rest collapse into "…". */
function visiblePages(page: number, totalPages: number): (number | "gap")[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1])
  const sorted = [...pages].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b)
  return sorted.flatMap((n, index) => (index > 0 && n - sorted[index - 1]! > 1 ? ["gap" as const, n] : [n]))
}

/**
 * Page navigation (`<nav aria-label="Paginação">`): "Anterior" and "Próxima" in words, and the
 * current page marked `aria-current="page"`.
 */
function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
  ...props
}: Omit<React.ComponentProps<"nav">, "children"> & {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  return (
    <nav data-slot="pagination" aria-label="Paginação" className={cn("flex justify-center", className)} {...props}>
      <ul className="m-0 flex list-none flex-wrap items-center gap-1 p-0">
        <li>
          <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft aria-hidden="true" />
            Anterior
          </Button>
        </li>
        {visiblePages(page, totalPages).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden="true" className="px-2 text-text-secondary">
              …
            </li>
          ) : (
            <li key={item}>
              <Button
                type="button"
                variant={item === page ? "outline" : "ghost"}
                size="icon"
                aria-label={`Página ${item}`}
                aria-current={item === page ? "page" : undefined}
                className={cn(item === page && "border-primary bg-primary-subtle text-primary-strong")}
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            </li>
          )
        )}
        <li>
          <Button type="button" variant="ghost" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            Próxima
            <ChevronRight aria-hidden="true" />
          </Button>
        </li>
      </ul>
    </nav>
  )
}

export { Pagination }
