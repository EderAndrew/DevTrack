import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { StudentDashboard } from "@/features/student-activities/components/student-dashboard";
import { DASHBOARD_PATH } from "@/lib/navigation";

export const metadata: Metadata = { title: "Painel" };

/** The student's start page (012 US2, research P23). */
export default async function DashboardPage() {
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(DASHBOARD_PATH)}`);
  if (!me.permissions.includes("atividades.proprias.visualizar")) return <NoAccess title="Painel" />;
  return (
    <section>
      <StudentDashboard />
    </section>
  );
}
