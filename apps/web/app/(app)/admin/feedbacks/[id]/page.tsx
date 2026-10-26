import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { AdminFeedbackDetail } from "@/features/feedback/components/admin-feedback-detail";
import { ADMIN_FEEDBACKS_PATH, ADMIN_FEEDBACKS_TITLE } from "@/features/feedback/schemas/admin-feedback";

export const metadata: Metadata = { title: "Feedback" };

/** One feedback for the ADMIN (020 US2): "Mudar situação" only with `feedbacks.alterar_situacao`. */
export default async function AdminFeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`${ADMIN_FEEDBACKS_PATH}/${id}`)}`);
  if (!me.permissions.includes("feedbacks.visualizar")) return <NoAccess title="Feedback" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Feedback" breadcrumb={[{ label: ADMIN_FEEDBACKS_TITLE, href: ADMIN_FEEDBACKS_PATH }, { label: "Feedback" }]} />
      <AdminFeedbackDetail id={id} canChange={me.permissions.includes("feedbacks.alterar_situacao")} />
    </section>
  );
}
