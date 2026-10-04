import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassRankingView } from "@/features/ranking/components/class-ranking";
import { classRankingHref } from "@/features/ranking/schemas/ranking";

export const metadata: Metadata = { title: "Ranking" };

/** Every position of one of the student's classes (013/US4-4). */
export default async function ClassRankingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(classRankingHref(id))}`);
  if (!me.permissions.includes("ranking.turma.visualizar")) return <NoAccess title="Ranking" />;
  return (
    <section>
      <ClassRankingView classId={id} />
    </section>
  );
}
