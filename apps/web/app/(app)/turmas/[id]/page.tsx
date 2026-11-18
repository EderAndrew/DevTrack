import type { Metadata } from "next";
import { ClassStudentsSection } from "@/features/classes/components/class-sections";

export const metadata: Metadata = { title: "Disciplina da turma" };

/** The turma's students, read only ("Alunos", the default section; the layout checks `disciplinas_turma.visualizar`). */
export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClassStudentsSection classId={id} />;
}
