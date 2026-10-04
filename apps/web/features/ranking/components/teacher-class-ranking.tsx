"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useClassRanking } from "../hooks/use-ranking";
import { RankingTable } from "./ranking-table";

/**
 * The teacher's "Ranking" section of a class page (013/US5, contracts/web-ui.md `/turmas/[id]/ranking`):
 * every position, the same rows the students see, none marked "Você". The class header and its `<h1>`
 * come from the class layout; another teacher's class answers 404, shown as the catalog's message.
 */
export function TeacherClassRanking({ classId }: { classId: string }) {
  const query = useClassRanking(classId);

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Carregando o ranking…</span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert">
        <p>{messageForError(query.error)}</p>
        <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const { class: schoolClass, rows } = query.data;
  return (
    <section aria-labelledby="ranking-titulo" className="flex flex-col gap-4">
      <h2 id="ranking-titulo" className="m-0 text-h2">
        Ranking
      </h2>
      <RankingTable rows={rows} caption={`Ranking da turma ${schoolClass.name}`} headingLevel="h3" />
    </section>
  );
}
