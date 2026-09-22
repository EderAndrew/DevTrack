import type { Metadata } from "next";
import { AdminActivation } from "./admin-activation";

/** The token must not leak to other sites through the Referer header (R7). */
export const metadata: Metadata = { title: "Ativar administrador", referrer: "no-referrer" };

export default async function AdminActivationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="page">
      <h1>Ativar conta de administrador</h1>
      <AdminActivation token={typeof token === "string" ? token : null} />
    </section>
  );
}
