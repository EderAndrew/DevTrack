"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useMyClasses } from "../hooks/use-my-classes";
import { NO_CLASSES, PAGE_SUBTITLE, PAGE_TITLE, subjectCards } from "../schemas/my-classes";
import { AcademicYearCard } from "./academic-year-card";
import { SubjectCard } from "./subject-card";

export interface MyClassesProps {
  /** Arrived from an accepted class invitation (`?bem-vindo=1`, FR-038). */
  welcome: boolean;
  /** Holds `ranking.turma.visualizar`: each disciplina shows the "Ranking da turma" panel (013/FR-021). */
  showRanking?: boolean;
}

/**
 * "Minhas turmas" (003 US7, 027 US8, redesigned by 030): the page header with the "Ano letivo" card and one card per
 * disciplina da turma of the student's active enrollments, in the API's order (most recent ano letivo, then the most
 * recent enrollment). The header lives here because the year comes from the list (030 research MT6). A closed turma
 * or an archived disciplina says so in words and stays readable. Nothing about other students.
 */
export function MyClasses({ welcome, showRanking = false }: MyClassesProps) {
  const query = useMyClasses();
  const cards = subjectCards(query.data);
  const latestYear = cards[0]?.academicYear;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={PAGE_TITLE}
        description={PAGE_SUBTITLE}
        actions={latestYear !== undefined ? <AcademicYearCard year={latestYear} /> : undefined}
        className="mb-0"
      />

      {welcome ? (
        <Notice role="status">
          <h2>Você agora faz parte da turma.</h2>
        </Notice>
      ) : null}

      {query.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">Carregando turmas…</span>
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : query.isError ? (
        <div role="alert">
          <p>{messageForError(query.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : cards.length === 0 ? (
        <p>{NO_CLASSES}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {cards.map((card) => (
            <SubjectCard key={card.key} card={card} showRanking={showRanking} />
          ))}
        </div>
      )}
    </div>
  );
}
