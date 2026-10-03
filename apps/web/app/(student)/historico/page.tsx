import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { StudentHistory } from "@/features/student-activities/components/student-history";
import { HISTORY_PATH } from "@/lib/navigation";

export const metadata: Metadata = { title: "Histórico" };

/** "Histórico" (012 US6): the student's submitted activities, grade and feedback once released. */
export default async function HistoryPage() {
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(HISTORY_PATH)}`);
  if (!me.permissions.includes("atividades.proprias.visualizar")) return <NoAccess title="Histórico" />;
  return (
    <section>
      <PageHeader title="Histórico" />
      <StudentHistory />
    </section>
  );
}
