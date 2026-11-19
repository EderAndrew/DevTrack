"use client";

import type { MyCohort } from "@repo/contracts";
import Link from "next/link";
import { Notice } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { classRankingHref } from "@/features/ranking/schemas/ranking";
import { messageForError } from "@/lib/messages/error-messages";
import { useMyClasses } from "../hooks/use-my-classes";
import { mySubjectLabel, NO_CLASSES, NO_SUBJECTS_YET, STATUS_BADGE, subjectActivitiesHref } from "../schemas/my-classes";

export interface MyClassesProps {
  /** Arrived from an accepted class invitation (`?bem-vindo=1`, FR-038). */
  welcome: boolean;
  /** Holds `ranking.turma.visualizar`: each disciplina links its "Ranking" (013/FR-021). */
  showRanking?: boolean;
}

/**
 * "Minhas turmas" (003 US7, 027 US8): the turmas of the student's active enrollments by ano letivo, most recent first, as
 * the API orders them; each turma once with its disciplinas, their teachers and a link to its activities
 * (`?materia=`). A closed turma or an archived disciplina says so in words and stays readable. Nothing about other
 * students.
 */
export function MyClasses({ welcome, showRanking = false }: MyClassesProps) {
  const query = useMyClasses();
  const years = query.data?.years ?? [];

  return (
    <div className="flex flex-col gap-6">
      {welcome ? (
        <Notice role="status">
          <h2>Você agora faz parte da turma.</h2>
        </Notice>
      ) : null}

      {query.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando turmas…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : query.isError ? (
        <div role="alert">
          <p>{messageForError(query.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : years.length === 0 ? (
        <p>{NO_CLASSES}</p>
      ) : (
        years.map((year) => (
          <section key={year.academicYear} aria-labelledby={`ano-${year.academicYear}`} className="flex flex-col gap-4">
            <h2 id={`ano-${year.academicYear}`} className="text-h2">
              {year.academicYear}
            </h2>
            {year.cohorts.map((cohort) => (
              <CohortSection key={cohort.id} cohort={cohort} showRanking={showRanking} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}

function CohortSection({ cohort, showRanking }: { cohort: MyCohort; showRanking: boolean }) {
  const badge = STATUS_BADGE[cohort.status];
  const headingId = `turma-${cohort.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={headingId} className="text-h3">
          {cohort.name}
        </h3>
        {badge ? <Badge variant="neutral">{badge}</Badge> : null}
      </div>
      <p className="text-body-sm text-text-secondary">
        <span>Código: {cohort.code}</span>
        {cohort.period ? <span> · Período: {cohort.period}</span> : null}
      </p>
      {cohort.classes.length === 0 ? (
        <p>{NO_SUBJECTS_YET}</p>
      ) : (
        <Table>
          <TableCaption className="sr-only">Disciplinas de {cohort.name}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Disciplina</TableHead>
              <TableHead scope="col">Professor</TableHead>
              <TableHead scope="col">Atividades</TableHead>
              {showRanking ? <TableHead scope="col">Ranking</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cohort.classes.map((item) => {
              const label = mySubjectLabel(item.subjectName, cohort.name);
              const itemBadge = cohort.status === "ACTIVE" ? STATUS_BADGE[item.effectiveStatus] : null;
              return (
                <TableRow key={item.classId}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <span>{item.subjectName ?? "Sem disciplina"}</span>
                      {itemBadge ? <Badge variant="neutral">{itemBadge}</Badge> : null}
                    </span>
                  </TableCell>
                  <TableCell>{item.teacherName}</TableCell>
                  <TableCell>
                    <Link href={subjectActivitiesHref(item.classId)} aria-label={`Atividades de ${label}`}>
                      Ver atividades
                    </Link>
                  </TableCell>
                  {showRanking ? (
                    <TableCell>
                      <Link href={classRankingHref(item.classId)} aria-label={`Ranking de ${label}`}>
                        Ranking
                      </Link>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
