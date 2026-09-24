import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassPlanSection } from "@/features/classes/components/class-sections";

export const metadata: Metadata = { title: "Planejamento da turma" };

export default async function ClassPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/planejamento`)}`);
  if (!me.permissions.includes("planejamento.visualizar")) return <NoAccess title="Planejamento" />;
  return (
    <ClassPlanSection
      classId={id}
      canEditClass={me.permissions.includes("turmas.editar")}
      canEdit={me.permissions.includes("planejamento.editar")}
      canChangeStatus={me.permissions.includes("planejamento.alterar_situacao")}
    />
  );
}
