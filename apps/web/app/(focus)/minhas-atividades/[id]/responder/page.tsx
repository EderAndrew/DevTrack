import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { answersInFocus } from "@/features/controlled-attempt/api/server";
import { ControlledAttempt } from "@/features/controlled-attempt/components/controlled-attempt";
import { activityHref, controlledAnswerHref } from "@/features/controlled-attempt/schemas/controlled-attempt";

export const metadata: Metadata = { title: "Responder em modo controlado" };

/**
 * A CONTROLLED work answered in focus (015 US2): no portal menu. A NORMAL work, or one not started,
 * goes back to its page (research F14).
 */
export default async function ControlledAnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(controlledAnswerHref(id))}`);
  if (!me.permissions.includes("atividades.proprias.responder")) return <NoAccess title="Atividade" />;
  if (!(await answersInFocus(id))) redirect(activityHref(id));
  return (
    <section data-layout="wide">
      <ControlledAttempt activityId={id} userId={me.id} />
    </section>
  );
}
