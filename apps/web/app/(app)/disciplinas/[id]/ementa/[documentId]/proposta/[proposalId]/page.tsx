import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { CurriculumProposalReview } from "@/features/curriculum-ai/components/curriculum-proposal-review";

export const metadata: Metadata = { title: "Proposta da IA para a ementa" };

/** 007/US3: the teacher reviews an AI proposal and applies it to the syllabus (UX gate only; the API decides). */
export default async function CurriculumProposalPage({
  params,
}: {
  params: Promise<{ id: string; documentId: string; proposalId: string }>;
}) {
  const { id, documentId, proposalId } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/disciplinas/${id}/ementa/${documentId}/proposta/${proposalId}`)}`);
  if (!me.permissions.includes("ementas.revisar") || !me.permissions.includes("ia.propostas.revisar")) {
    return <NoAccess title="Proposta da IA para a ementa" />;
  }

  return (
    <section className="mx-auto w-full max-w-256">
      <CurriculumProposalReview subjectId={id} documentId={documentId} proposalId={proposalId} />
    </section>
  );
}
