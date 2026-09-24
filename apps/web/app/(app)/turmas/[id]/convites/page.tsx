import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/features/auth/api/server";
import { ClassInvitationsSection } from "@/features/classes/components/class-sections";

export const metadata: Metadata = { title: "Convites da turma" };

export default async function ClassInvitationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/convites`)}`);
  return (
    <ClassInvitationsSection
      classId={id}
      canResend={me.permissions.includes("turmas.reenviar_convite")}
      canCancel={me.permissions.includes("turmas.cancelar_convite")}
    />
  );
}
