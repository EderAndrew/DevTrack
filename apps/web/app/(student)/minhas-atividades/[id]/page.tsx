import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ActivityAnswering } from "@/features/student-activities/components/activity-answering";
import { activityHref } from "@/features/student-activities/schemas/student-activity";

export const metadata: Metadata = { title: "Atividade" };

/** One activity of the student: its header, "Iniciar atividade" and the answering screen (012 US3). */
export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(activityHref(id))}`);
  if (!me.permissions.includes("atividades.proprias.visualizar")) return <NoAccess title="Atividade" />;
  return (
    // Wide: a code question shows the statement and the editor side by side.
    <section data-layout="wide">
      <ActivityAnswering activityId={id} userId={me.id} />
    </section>
  );
}
