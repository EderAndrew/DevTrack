import type { ReactNode } from "react";
import { Breadcrumb, type BreadcrumbItem } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** The page's `<h1>`; keep the text the page had, so its accessible name does not change. */
  title: ReactNode;
  /** Trail from the area to this page; the last item is the current page, without a link. */
  breadcrumb?: readonly BreadcrumbItem[];
  /** Beside the title, outside the `<h1>` (e.g. the status badge). */
  status?: ReactNode;
  description?: ReactNode;
  /** The page's main actions: at the right on wide screens, under the title on narrow ones. */
  actions?: ReactNode;
  className?: string;
}

/** Header of every internal page (005 contracts/components.md "PageHeader"). */
export function PageHeader({ title, breadcrumb, status, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 flex flex-col gap-2", className)}>
      {breadcrumb ? <Breadcrumb items={breadcrumb} /> : null}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="m-0 text-h1">{title}</h1>
            {status}
          </div>
          {description ? <div className="m-0 text-body text-text-secondary">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-start gap-2 md:shrink-0 md:justify-end">{actions}</div> : null}
      </div>
    </header>
  );
}
