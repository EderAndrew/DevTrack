import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { ActivityDetail } from "@/features/activities/components/activity-detail";
import { getMe } from "@/features/auth/api/server";

export const metadata: Metadata = { title: "Atividade" };

/** One activity of the class, with the answer key and the students' situations (012 contracts/web-ui.md). */
export default async function ActivityPage({ params }: { params: Promise<{ id: string; activityId: string }> }) {
  const { id, activityId } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/atividades/${activityId}`)}`);
  if (!me.permissions.includes("atividades.visualizar")) return <NoAccess title="Atividade" />;
  return <ActivityDetail classId={id} activityId={activityId} canApply={me.permissions.includes("atividades.aplicar")} />;
}
