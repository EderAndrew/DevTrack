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

  return (
    <section className="mx-auto max-w-256 px-4 py-8">
      <h1>Editar turma</h1>
      <ClassEdit id={id} />
    </section>
  );
}
