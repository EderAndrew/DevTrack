"use client";

import type { SubjectView } from "@repo/contracts";
import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useClasses } from "@/features/classes/hooks/use-classes";
import { formatDate } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { CLASS_PLAN_STATUS_LABELS } from "@/lib/messages/status-labels";
import { useSubject } from "../hooks/use-subjects";
import { SubjectForm } from "./subject-form";
import { SubjectStatusActions } from "./subject-status-actions";
import { SubjectStatusBadge } from "./subject-status-badge";

export interface SubjectDetailProps {
  id: string;
  /** Just created (`?criada=1`): shows "Disciplina criada.". */
  created?: boolean;
  /** UX only (the API authorizes): edit and status actions. */
  canEdit: boolean;
  /** "Nova turma" with this subject chosen, while the subject is active. */
  canCreateClass: boolean;
}

/**
 * Subject page (004/US1): data with Editar and Desativar/Reativar, the classes that offer it
 * (period, dates and plan status) with "Nova turma", and the syllabus section (filled by US2).
 */
export function SubjectDetail({ id, created = false, canEdit, canCreateClass }: SubjectDetailProps) {
  const query = useSubject(id);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState(created ? "Disciplina criada." : "");

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Carregando disciplina…</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
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

  const subject = query.data;
  const onSaved = () => {
    setEditing(false);
    setNotice("Disciplina salva.");
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="m-0">{subject.name}</h1>
        <SubjectStatusBadge status={subject.status} />
      </div>
      {notice ? <Notice role="status">{notice}</Notice> : null}

      {editing ? (
        <SubjectForm initial={subject} onSaved={onSaved} onCancel={() => setEditing(false)} />
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
            <dt className="font-semibold">Descrição</dt>
            <dd className="m-0 whitespace-pre-line">{subject.description ?? "Sem descrição"}</dd>
          </dl>
          {canEdit ? (
            <div className="mb-6 flex flex-wrap items-start gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setNotice("");
                  setEditing(true);
                }}
              >
                <Pencil aria-hidden="true" />
                Editar
              </Button>
              <SubjectStatusActions subject={subject} />
            </div>
          ) : null}
        </>
      )}

      <SubjectClasses subject={subject} canCreateClass={canCreateClass} />

      <section aria-labelledby="ementa-titulo" className="mt-8">
        <h2 id="ementa-titulo">Ementa</h2>
        <p>Nenhuma ementa enviada.</p>
      </section>
    </div>
  );
}

/** "Turmas da disciplina": the offerings of the subject, with their period, dates and plan status. */
function SubjectClasses({ subject, canCreateClass }: { subject: SubjectView; canCreateClass: boolean }) {
  const classes = useClasses({ subjectId: subject.id });
  const items = classes.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section aria-labelledby="turmas-titulo" className="mt-8">
      <h2 id="turmas-titulo">Turmas da disciplina</h2>
      {canCreateClass && subject.status === "ACTIVE" ? (
        <Button asChild className="mb-4">
          <Link href={`/turmas/nova?disciplina=${subject.id}`}>
            <Plus aria-hidden="true" />
            Nova turma
          </Link>
        </Button>
      ) : null}
      {classes.isPending ? (
        <div aria-busy="true">
          <span className="sr-only">Carregando turmas…</span>
          <Skeleton className="h-10 w-full" />
        </div>
      ) : classes.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(classes.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void classes.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p>Nenhuma turma ligada a esta disciplina.</p>
      ) : (
        <Table className="mb-4">
          <TableCaption className="sr-only">Turmas da disciplina</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Turma</TableHead>
              <TableHead scope="col">Período</TableHead>
              <TableHead scope="col">Início</TableHead>
              <TableHead scope="col">Término</TableHead>
              <TableHead scope="col">Planejamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/turmas/${item.id}`}>{item.name}</Link>
                </TableCell>
                <TableCell>{item.period ?? "—"}</TableCell>
                <TableCell>{item.startsOn ? formatDate(item.startsOn) : "—"}</TableCell>
                <TableCell>{item.endsOn ? formatDate(item.endsOn) : "—"}</TableCell>
                <TableCell>{item.planStatus ? CLASS_PLAN_STATUS_LABELS[item.planStatus] : "Não iniciado"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {classes.hasNextPage ? (
        <Button
          type="button"
          aria-busy={classes.isFetchingNextPage || undefined}
          onClick={() => (classes.isFetchingNextPage ? undefined : void classes.fetchNextPage())}
        >
          Carregar mais turmas
        </Button>
      ) : null}
    </section>
  );
}
