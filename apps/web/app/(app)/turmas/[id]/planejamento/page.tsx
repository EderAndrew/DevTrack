import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassPlanningSection } from "@/features/classes/components/class-sections";

export const metadata: Metadata = { title: "Planejamento da turma" };

export default async function ClassPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/planejamento`)}`);
  if (!me.permissions.includes("planejamento.visualizar")) return <NoAccess title="Planejamento" />;
  return (
    <ClassPlanningSection
      classId={id}
      title="Planejamento"
      empty="O planejamento desta turma ainda não foi criado."
      canEditClass={me.permissions.includes("turmas.editar")}
    />
  );
}
