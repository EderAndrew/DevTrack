import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMe } from "@/features/auth/api/server";
import { ClassStudentsSection } from "@/features/classes/components/class-sections";

export const metadata: Metadata = { title: "Turma" };

/** The class's students ("Alunos", the default section; the layout checks `turmas.visualizar`). */
export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}`)}`);
  return <ClassStudentsSection classId={id} canRemove={me.permissions.includes("turmas.remover_aluno")} />;
}
