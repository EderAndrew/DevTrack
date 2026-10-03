"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { MY_CLASSES_PATH } from "@/lib/navigation";
import { useMyClassRanking } from "../hooks/use-ranking";
import { RankingTable } from "./ranking-table";

const TITLE = "Ranking";

/**
 * The student's "Ranking" of a class (013/US4-4, contracts/web-ui.md `/minhas-turmas/[id]/ranking`):
 * every position, the student's own row marked "Você". A class the student isn't in answers 404,
 * shown as the catalog's message.
 */
export function ClassRankingView({ classId }: { classId: string }) {
  const query = useMyClassRanking(classId);
  const breadcrumb = (current: string) => [{ label: "Minhas turmas", href: MY_CLASSES_PATH }, { label: current }];

  if (query.isPending) {
    return (
      <>
        <PageHeader title={TITLE} breadcrumb={breadcrumb(TITLE)} />
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando o ranking…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title={TITLE} breadcrumb={breadcrumb(TITLE)} />
        <Alert variant="danger">
          <AlertTitle>{messageForError(query.error)}</AlertTitle>
          <AlertDescription>
            <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const { class: schoolClass, rows } = query.data;
  const title = `${TITLE} — ${schoolClass.name}`;
  return (
    <>
      <PageHeader title={title} breadcrumb={breadcrumb(title)} />
      <RankingTable rows={rows} caption={`Ranking da turma ${schoolClass.name}`} headingLevel="h2" />
    </>
  );
}
