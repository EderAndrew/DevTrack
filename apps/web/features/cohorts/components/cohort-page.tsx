"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassStatusBadge } from "@/features/classes/components/class-status-badge";
import { messageForError } from "@/lib/messages/error-messages";
import { useCohort } from "../hooks/use-cohorts";
import { CohortFormDialog } from "./cohort-form";
import { CohortStatusActions } from "./cohort-status-actions";

export interface CohortPageProps {
  id: string;
  /** UX only (the API authorizes): which actions to offer. */
  canEdit: boolean;
  canChangeStatus: boolean;
}

/**
 * The MANAGER's page of a turma (027/FR-007, contracts/ui.md): its data, the actions (Editar, Encerrar/Reativar,
 * Arquivar) and the "Disciplinas" tab — each disciplina da turma with its teacher and situation, and nothing of its
 * plan, classes, activities or grades. The "Alunos" and "Convites" tabs join with US2. Names are text (FR-033).
 */
export function CohortPage({ id, canEdit, canChangeStatus }: CohortPageProps) {
  const query = useCohort(id);

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

  const cohort = query.data;
  const editable = canEdit && cohort.status !== "ARCHIVED";
  const actions =
    editable || canChangeStatus ? (
      <>
        {editable ? <CohortFormDialog initial={cohort} /> : null}
        {canChangeStatus ? <CohortStatusActions cohort={cohort} /> : null}
      </>
    ) : null;

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: "Turmas", href: "/gestao/turmas" }, { label: cohort.name }]}
        title={cohort.name}
        status={<ClassStatusBadge status={cohort.status} />}
        actions={actions}
        className="mb-4"
      />
      <dl className="mb-6 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">Código</dt>
        <dd className="m-0">{cohort.code}</dd>
        <dt className="font-semibold">Ano letivo</dt>
        <dd className="m-0">{cohort.academicYear}</dd>
        <dt className="font-semibold">Período</dt>
        <dd className="m-0">{cohort.period ?? "Não informado"}</dd>
        <dt className="font-semibold">Alunos ativos</dt>
        <dd className="m-0">{cohort.activeEnrollmentCount}</dd>
        <dt className="font-semibold">Descrição</dt>
        <dd className="m-0 whitespace-pre-line">{cohort.description ?? "Sem descrição"}</dd>
      </dl>

      <Tabs defaultValue="disciplinas">
        <TabsList aria-label="Seções da turma">
          <TabsTrigger value="disciplinas">Disciplinas</TabsTrigger>
        </TabsList>
        <TabsContent value="disciplinas">
          {cohort.classes.length === 0 ? (
            <p>Nenhuma disciplina acrescentada a esta turma ainda.</p>
          ) : (
            <Table>
              <TableCaption className="sr-only">Disciplinas da turma</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Disciplina</TableHead>
                  <TableHead scope="col">Professor</TableHead>
                  <TableHead scope="col">Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cohort.classes.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.subjectName ?? "Sem disciplina"}</TableCell>
                    <TableCell>{item.teacherName}</TableCell>
                    <TableCell>
                      <ClassStatusBadge status={item.effectiveStatus} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
