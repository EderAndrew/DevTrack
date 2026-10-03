import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { ClassActivities } from "@/features/activities/components/class-activities";
import { getMe } from "@/features/auth/api/server";

export const metadata: Metadata = { title: "Atividades da turma" };

/** The class's activities (012 contracts/web-ui.md); the layout checks `turmas.visualizar`. */
export default async function ClassActivitiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/atividades`)}`);
  if (!me.permissions.includes("atividades.visualizar")) return <NoAccess title="Atividades" />;
  return <ClassActivities classId={id} canApply={me.permissions.includes("atividades.aplicar")} />;
}
