import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { AdminFeedbackList } from "@/features/feedback/components/admin-feedback-list";
import { ADMIN_FEEDBACKS_TITLE, filtersFromSearch } from "@/features/feedback/schemas/admin-feedback";

export const metadata: Metadata = { title: ADMIN_FEEDBACKS_TITLE };

const LOGIN = "/entrar?next=%2Fadmin%2Ffeedbacks";

/** The ADMIN's feedbacks (020 US2); the filters come from `?situacao=&categoria=`. */
export default async function AdminFeedbacksPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string | string[]; categoria?: string | string[] }>;
}) {
  const me = await getMe();
  if (!me) redirect(LOGIN);
  if (!me.permissions.includes("feedbacks.visualizar")) return <NoAccess title={ADMIN_FEEDBACKS_TITLE} />;

  return (
    <section className="w-full">
      <PageHeader title={ADMIN_FEEDBACKS_TITLE} description="O que os alunos contaram sobre o DevTrack. Os professores não veem estes feedbacks." />
      <AdminFeedbackList initialFilters={filtersFromSearch(await searchParams)} />
    </section>
  );
}
