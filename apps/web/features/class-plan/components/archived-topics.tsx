"use client";

import type { TopicView } from "@repo/contracts";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useArchivedTopics } from "../hooks/use-class-plan";

export interface ArchivedTopicsProps {
  classId: string;
  /** `archivedTopicCount` of the plan: the list is fetched only when there is something to show. */
  count: number;
  /** Non-archived topics, to name the one a topic was merged into. */
  topics: readonly TopicView[];
  canEdit: boolean;
  busy: boolean;
  onRestore: (topic: TopicView) => void;
}

/**
 * "Tópicos arquivados" (004/US6-5, FR-038): archived topics are kept and can be restored, except
 * one archived after its class was completed, which shows "Aula concluída" for good (004/US9-5).
 */
export function ArchivedTopics({ classId, count, topics, canEdit, busy, onRestore }: ArchivedTopicsProps) {
  const query = useArchivedTopics(classId, count > 0);
  const titles = new Map(topics.map((topic) => [topic.id, topic.title]));

  return (
    <section aria-labelledby="arquivados-titulo" className="flex flex-col gap-2">
      <h2 id="arquivados-titulo">Tópicos arquivados</h2>
      {count === 0 ? (
        <p className="m-0">Nenhum tópico arquivado.</p>
      ) : query.isPending ? (
        <div aria-busy="true">
          <span className="sr-only">Carregando tópicos arquivados…</span>
          <Skeleton className="h-12 w-full" />
        </div>
      ) : query.isError ? (
        <div role="alert">
          <p>{messageForError(query.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {query.data.items.map((topic) => (
            <li key={topic.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
              <span className="font-semibold">{topic.title}</span>
              {topic.mergedIntoTopicId ? (
                <span className="text-muted-foreground">Juntado em: {titles.get(topic.mergedIntoTopicId) ?? "outro tópico"}.</span>
              ) : null}
              {topic.completedOn ? (
                <span className="font-semibold text-success-text">Aula concluída em {formatDate(topic.completedOn)}.</span>
              ) : null}
              {canEdit && !topic.completedOn ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  aria-label={`Restaurar ${topic.title}`}
                  onClick={() => onRestore(topic)}
                >
                  <RotateCcw aria-hidden="true" />
                  Restaurar
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
