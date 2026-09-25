import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { AdminActivation } from "@/features/admin-activation/components/admin-activation";

/** The token must not leak to other sites through the Referer header (R7). */
export const metadata: Metadata = { title: "Ativar administrador", referrer: "no-referrer" };

export default async function AdminActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="mx-auto max-w-160 px-4 py-8">
      <PageHeader title="Ativar conta de administrador" />
      <AdminActivation token={typeof token === "string" ? token : null} />
    </section>
  );
}
