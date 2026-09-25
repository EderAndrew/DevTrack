import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";

/** The token must not leak to other sites through the Referer header (R7). */
export const metadata: Metadata = { title: "Redefinir senha", referrer: "no-referrer" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="mx-auto max-w-160 px-4 py-8">
      <PageHeader title="Redefinir senha" />
      <ResetPasswordForm token={typeof token === "string" ? token : null} />
    </section>
  );
}
