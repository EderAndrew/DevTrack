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
import { classLabel } from "../schemas/class-label";
import { ClassStatusBadge } from "./class-status-badge";

export interface ClassDetailsProps {
  id: string;
  /** UX only (the API authorizes): "Editar calendário" (`disciplinas_turma.editar`). */
  canEdit: boolean;
  /** UX only: "Encerrar disciplina"/"Arquivar disciplina" (`disciplinas_turma.alterar_situacao`), shown with `canChangeStatus`. */
  canChangeStatus: boolean;
}

/**
 * Header of every page of a disciplina da turma (003 FR-008; 027/FR-021): "<disciplina> · <turma>", the turma's
 * code, year and period, the calendar (004/US1-3), the effective status, the number of active students and the
 * actions — "Editar calendário" and, only after the calendar's last day (`canChangeStatus` of the API, FR-022), the
 * status actions. No invitation, removal or edit of the turma: those are the MANAGER's. The sections (Alunos, …) are
 * routes below it, reached through `ClassTabs`.
 */
export function ClassDetails({ id, canEdit, canChangeStatus }: ClassDetailsProps) {
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
  const title = classLabel(schoolClass);
  const archived = schoolClass.effectiveStatus === "ARCHIVED";
  const showEdit = canEdit && !archived;
  const showStatus = canChangeStatus && schoolClass.canChangeStatus && !archived;
  const actions =
    showEdit || showStatus ? (
      <>
        {showEdit ? (
          <Button asChild variant="secondary">
            <Link href={`/turmas/${schoolClass.id}/editar`}>
              <Pencil aria-hidden="true" />
              Editar calendário
            </Link>
          </Button>
        ) : null}
        {showStatus ? <ClassStatusActions schoolClass={schoolClass} /> : null}
      </>
    ) : null;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Turmas", href: "/turmas" }, { label: title }]}
        title={title}
        status={<ClassStatusBadge status={schoolClass.effectiveStatus} />}
        actions={actions}
        className="mb-4"
      />
      <dl className="mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">Turma</dt>
        <dd className="m-0">{schoolClass.cohort.name}</dd>
        <dt className="font-semibold">Código</dt>
        <dd className="m-0">{schoolClass.cohort.code}</dd>
        <dt className="font-semibold">Ano letivo</dt>
        <dd className="m-0">{schoolClass.cohort.academicYear}</dd>
        <dt className="font-semibold">Disciplina</dt>
        <dd className="m-0">
          {schoolClass.subject ? (
            <Link href={`/disciplinas/${schoolClass.subject.id}`}>{schoolClass.subject.name}</Link>
          ) : (
            "Não informada"
          )}
        </dd>
        <dt className="font-semibold">Período</dt>
        <dd className="m-0">{schoolClass.cohort.period ?? "Não informado"}</dd>
        <dt className="font-semibold">Datas</dt>
        <dd className="m-0">
          {schoolClass.startsOn && schoolClass.endsOn
            ? `${formatDate(schoolClass.startsOn)} a ${formatDate(schoolClass.endsOn)}`
            : "Não informadas"}
        </dd>
        <dt className="font-semibold">Alunos ativos</dt>
        <dd className="m-0">{schoolClass.activeStudentCount}</dd>
      </dl>
    </div>
  );
}

