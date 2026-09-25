"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useClass } from "../hooks/use-classes";
import { ClassStatusActions } from "./class-status-actions";
import { ClassStatusBadge } from "./class-status-badge";
import { InviteStudentDialog } from "./invite-student-dialog";

export interface ClassDetailsProps {
  id: string;
  /** UX only (the API authorizes): which actions to offer. */
  canEdit: boolean;
  canChangeStatus: boolean;
  /** "Convidar aluno", offered only while the class is ACTIVE (FR-010). */
  canInvite: boolean;
}

/**
 * Header of every class page (FR-008): data, the offering (subject, dates; 004/US1-3), status,
 * number of active students and the actions ("Convidar aluno", Editar, status changes). The
 * sections (Alunos, Convites, …) are routes below it, reached through `ClassTabs`.
 */
export function ClassDetails({ id, canEdit, canChangeStatus, canInvite }: ClassDetailsProps) {
  const query = useClass(id);

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Carregando turma…</span>
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

  const schoolClass = query.data;
  const archived = schoolClass.status === "ARCHIVED";
  const actions =
    (canInvite && schoolClass.status === "ACTIVE") || (canEdit && !archived) || canChangeStatus ? (
      <>
        {canInvite && schoolClass.status === "ACTIVE" ? <InviteStudentDialog classId={schoolClass.id} /> : null}
        {canEdit && !archived ? (
          <Button asChild variant="secondary">
            <Link href={`/turmas/${schoolClass.id}/editar`}>
              <Pencil aria-hidden="true" />
              Editar
            </Link>
          </Button>
        ) : null}
        {canChangeStatus ? <ClassStatusActions schoolClass={schoolClass} /> : null}
      </>
    ) : null;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Turmas", href: "/turmas" }, { label: schoolClass.name }]}
        title={schoolClass.name}
        status={<ClassStatusBadge status={schoolClass.status} />}
        actions={actions}
        className="mb-4"
      />
      <dl className="mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">Código</dt>
        <dd className="m-0">{schoolClass.code}</dd>
        <dt className="font-semibold">Ano letivo</dt>
        <dd className="m-0">{schoolClass.academicYear}</dd>
        <dt className="font-semibold">Disciplina</dt>
        <dd className="m-0">
          {schoolClass.subject ? (
            <Link href={`/disciplinas/${schoolClass.subject.id}`}>{schoolClass.subject.name}</Link>
          ) : (
            "Não informada"
          )}
        </dd>
        <dt className="font-semibold">Período</dt>
        <dd className="m-0">{schoolClass.period ?? "Não informado"}</dd>
        <dt className="font-semibold">Datas</dt>
        <dd className="m-0">
          {schoolClass.startsOn && schoolClass.endsOn
            ? `${formatDate(schoolClass.startsOn)} a ${formatDate(schoolClass.endsOn)}`
            : "Não informadas"}
        </dd>
        <dt className="font-semibold">Alunos ativos</dt>
        <dd className="m-0">{schoolClass.activeStudentCount}</dd>
        <dt className="font-semibold">Descrição</dt>
        <dd className="m-0 whitespace-pre-line">{schoolClass.description ?? "Sem descrição"}</dd>
      </dl>
    </div>
  );
}

