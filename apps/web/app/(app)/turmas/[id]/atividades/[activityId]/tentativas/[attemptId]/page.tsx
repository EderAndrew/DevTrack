import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { AttemptReview } from "@/features/activities/components/attempt-review";
import { getMe } from "@/features/auth/api/server";

export const metadata: Metadata = { title: "Tentativa do aluno" };

/** One student's attempt next to the answer key, its grading and acceptance (012), or its marks (013 contracts/web-ui.md). */
export default async function AttemptPage({ params }: { params: Promise<{ id: string; activityId: string; attemptId: string }> }) {
  const { id, activityId, attemptId } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/atividades/${activityId}/tentativas/${attemptId}`)}`);
  if (!me.permissions.includes("entregas.visualizar")) return <NoAccess title="Tentativa do aluno" />;
  return (
    <AttemptReview
      classId={id}
      activityId={activityId}
      attemptId={attemptId}
      canGrade={me.permissions.includes("notas.lancar")}
      canMark={me.permissions.includes("exercicios.corrigir")}
    />
  );
}
