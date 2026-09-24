import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassDetails } from "@/features/classes/components/class-details";
import { ClassTabs } from "@/features/classes/components/class-tabs";

/** Every page of a class: its header (data and actions), the section tabs, then the section. */
export default async function ClassLayout({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}`)}`);
  if (!me.permissions.includes("turmas.visualizar")) return <NoAccess title="Turma" />;

  return (
    <section className="mx-auto w-full max-w-256 px-4 py-8">
      <ClassDetails
        id={id}
        canEdit={me.permissions.includes("turmas.editar")}
        canChangeStatus={me.permissions.includes("turmas.alterar_situacao")}
        canInvite={me.permissions.includes("turmas.convidar_aluno")}
      />
      <ClassTabs classId={id} showPlanning={me.permissions.includes("planejamento.visualizar")} />
      {children}
    </section>
  );
}
