"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { messageForError } from "@/lib/messages/error-messages";
import { useClass } from "../hooks/use-classes";
import { ClassForm } from "./class-form";

/** Edit page body: loads the class, then the form filled with it. An archived class is not editable (FR-003). */
export function ClassEdit({ id }: { id: string }) {
  const query = useClass(id);

  if (query.isPending) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando turma…</span>
        <Skeleton className="h-64 w-full" />
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
  if (query.data.status === "ARCHIVED") return <p>Uma turma arquivada não pode ser editada.</p>;
  return <ClassForm initial={query.data} />;
}
