import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassPlanningSection } from "@/features/classes/components/class-sections";

export const metadata: Metadata = { title: "Ementa da turma" };

export default async function ClassSyllabusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/ementa`)}`);
  if (!me.permissions.includes("planejamento.visualizar")) return <NoAccess title="Ementa" />;
  return (
    <ClassPlanningSection
      classId={id}
      title="Ementa"
      empty="Nenhuma ementa escolhida para esta turma."
      canEditClass={me.permissions.includes("turmas.editar")}
    />
  );
}
