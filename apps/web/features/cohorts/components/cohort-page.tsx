"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassInvitationsTab } from "@/features/classes/components/class-invitations-tab";
import { ClassStatusBadge } from "@/features/classes/components/class-status-badge";
import { messageForError } from "@/lib/messages/error-messages";
import { useCohort } from "../hooks/use-cohorts";
import { AddStudentDialog } from "./add-student";
import { CohortFormDialog } from "./cohort-form";
import { CohortStatusActions } from "./cohort-status-actions";
import { CohortStudentsTab } from "./cohort-students-tab";

export interface CohortPageProps {
  id: string;
  /** UX only (the API authorizes): which actions to offer. */
  canEdit: boolean;
  canChangeStatus: boolean;
  /** "Adicionar aluno": the invitation (`turmas.convidar_aluno`) and the lookup + direct inclusion (`turmas.incluir_aluno`). */
  canInvite?: boolean;
  canInclude?: boolean;
  canSeeStudents?: boolean;
  canResend?: boolean;
  canCancel?: boolean;
}

/**
 * The MANAGER's page of a turma (027/FR-007, contracts/ui.md): its data, the actions (Editar, Encerrar/Reativar,
 * Arquivar, "Adicionar aluno" while ACTIVE) and the tabs "Alunos" (US2), "Convites" (the 003/017 list) and "Disciplinas"
 * — each disciplina da turma with its teacher and situation, and nothing of its plan, classes, activities or grades.
 * Names are text (FR-033).
 */
export function CohortPage({
  id,
  canEdit,
  canChangeStatus,
  canInvite = false,
  canInclude = false,
  canSeeStudents = false,
  canResend = false,
  canCancel = false,
}: CohortPageProps) {
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
  const adding = (canInvite || canInclude) && cohort.status === "ACTIVE";
  const actions =
    editable || canChangeStatus || adding ? (
      <>
        {adding ? <AddStudentDialog cohortId={cohort.id} canInclude={canInclude} canInvite={canInvite} /> : null}
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

      <Tabs defaultValue={canSeeStudents ? "alunos" : "disciplinas"}>
        <TabsList aria-label="Seções da turma">
          {canSeeStudents ? <TabsTrigger value="alunos">Alunos</TabsTrigger> : null}
          <TabsTrigger value="convites">Convites</TabsTrigger>
          <TabsTrigger value="disciplinas">Disciplinas</TabsTrigger>
        </TabsList>
        {canSeeStudents ? (
          <TabsContent value="alunos">
            <CohortStudentsTab cohortId={cohort.id} />
          </TabsContent>
        ) : null}
        <TabsContent value="convites">
          <ClassInvitationsTab classId={cohort.id} canResend={canResend && cohort.status === "ACTIVE"} canCancel={canCancel} />
        </TabsContent>
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
