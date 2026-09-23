import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassDetails } from "@/features/classes/components/class-details";

export const metadata: Metadata = { title: "Turma" };

export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}`)}`);
  if (!me.permissions.includes("turmas.visualizar")) return <NoAccess title="Turma" />;

  return (
    <section className="mx-auto max-w-256 px-4 py-8">
      <ClassDetails
        id={id}
        canEdit={me.permissions.includes("turmas.editar")}
        canChangeStatus={me.permissions.includes("turmas.alterar_situacao")}
        canInvite={me.permissions.includes("turmas.convidar_aluno")}
        canResendInvitation={me.permissions.includes("turmas.reenviar_convite")}
        canCancelInvitation={me.permissions.includes("turmas.cancelar_convite")}
        canRemoveStudent={me.permissions.includes("turmas.remover_aluno")}
      />
    </section>
  );
}
