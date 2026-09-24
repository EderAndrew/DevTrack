import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassEdit } from "@/features/classes/components/class-edit";

export const metadata: Metadata = { title: "Editar turma" };

export default async function EditClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/editar`)}`);
  if (!me.permissions.includes("turmas.editar")) return <NoAccess title="Editar turma" />;

  // Inside the class layout, below the class header and its sections.
  return (
    <section aria-labelledby="editar-titulo">
      <h2 id="editar-titulo">Editar turma</h2>
      <ClassEdit id={id} />
    </section>
  );
}
