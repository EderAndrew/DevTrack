import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { MyClasses } from "@/features/my-classes/components/my-classes";

export const metadata: Metadata = { title: "Minhas turmas" };

export default async function MyClassesPage({ searchParams }: { searchParams: Promise<{ "bem-vindo"?: string }> }) {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fminhas-turmas");
  if (!me.permissions.includes("turmas.proprias.listar")) return <NoAccess title="Minhas turmas" />;
  const { "bem-vindo": welcome } = await searchParams;

  return (
    <section className="mx-auto w-full max-w-256 px-4 py-8">
      <h1>Minhas turmas</h1>
      <MyClasses welcome={welcome === "1"} />
    </section>
  );
}
