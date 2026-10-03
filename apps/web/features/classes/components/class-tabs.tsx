"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface ClassTabsProps {
  classId: string;
  /** Ementa, Calendário and Planejamento (004, `planejamento.visualizar`; UX only). */
  showPlanning: boolean;
  /** Atividades (012, `atividades.visualizar`; UX only). */
  showActivities?: boolean;
}

/**
 * Sections of a class page (004 contracts/web-ui.md): Alunos, Convites, Ementa, Calendário,
 * Planejamento and (012) Atividades. Each one is its own route under `/turmas/[id]`, so these are links, and the
 * current one is marked `aria-current="page"`.
 */
export function ClassTabs({ classId, showPlanning, showActivities = false }: ClassTabsProps) {
  const pathname = usePathname();
  const base = `/turmas/${classId}`;
  const tabs = [
    { href: base, label: "Alunos" },
    { href: `${base}/convites`, label: "Convites" },
    ...(showPlanning
      ? [
          { href: `${base}/ementa`, label: "Ementa" },
          { href: `${base}/calendario`, label: "Calendário" },
          { href: `${base}/planejamento`, label: "Planejamento" },
        ]
      : []),
    ...(showActivities ? [{ href: `${base}/atividades`, label: "Atividades" }] : []),
  ];

  return (
    <nav aria-label="Seções da turma" className="mb-4 border-b border-border">
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {tabs.map((tab) => {
          // Atividades stays current on its own pages (nova, an activity).
          const current = pathname === tab.href || (tab.label === "Atividades" && pathname.startsWith(`${tab.href}/`));
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center border-b-2 border-transparent px-3 text-foreground no-underline",
                  current && "border-primary font-semibold",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
