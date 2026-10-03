import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { NewActivity } from "@/features/activities/components/new-activity";
import { getMe } from "@/features/auth/api/server";

export const metadata: Metadata = { title: "Nova atividade" };

/** "Nova atividade": a work or exercises of the teacher's bank applied to the class (012/US1). */
export default async function NewActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/atividades/nova`)}`);
  if (!me.permissions.includes("atividades.aplicar")) return <NoAccess title="Nova atividade" />;
  return <NewActivity classId={id} />;
}
