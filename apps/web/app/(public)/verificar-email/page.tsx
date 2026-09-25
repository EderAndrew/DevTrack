import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { VerifyEmail } from "@/features/auth/components/verify-email";

/** The token must not leak to other sites through the Referer header (R7). */
export const metadata: Metadata = { title: "Verificar e-mail", referrer: "no-referrer" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="mx-auto max-w-160 px-4 py-8">
      <PageHeader title="Verificar e-mail" />
      <VerifyEmail token={typeof token === "string" ? token : null} />
    </section>
  );
}
