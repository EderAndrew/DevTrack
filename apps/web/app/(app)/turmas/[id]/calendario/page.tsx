import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassCalendarSection } from "@/features/classes/components/class-sections";

export const metadata: Metadata = { title: "Calendário da turma" };

export default async function ClassCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/calendario`)}`);
  if (!me.permissions.includes("planejamento.visualizar")) return <NoAccess title="Calendário" />;
  return (
    <ClassCalendarSection
      classId={id}
      canEditClass={me.permissions.includes("turmas.editar")}
      canManage={me.permissions.includes("calendario.gerenciar")}
    />
  );
}
