import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { CohortPage } from "@/features/cohorts/components/cohort-page";

export const metadata: Metadata = { title: "Turma" };

/** The MANAGER's page of a turma (027/FR-007). */
export default async function CohortDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/gestao/turmas/${id}`)}`);
  if (!me.permissions.includes("turmas.visualizar")) return <NoAccess title="Turma" />;

  return (
    <section data-layout="wide" className="w-full">
      <CohortPage
        id={id}
        canEdit={me.permissions.includes("turmas.editar")}
        canChangeStatus={me.permissions.includes("turmas.alterar_situacao")}
        canInvite={me.permissions.includes("turmas.convidar_aluno")}
        canInclude={me.permissions.includes("turmas.incluir_aluno")}
        canSeeStudents={me.permissions.includes("turmas.visualizar_alunos")}
        canResend={me.permissions.includes("turmas.reenviar_convite")}
        canCancel={me.permissions.includes("turmas.cancelar_convite")}
      />
    </section>
  );
}
