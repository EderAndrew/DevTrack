import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

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
      <h1>Redefinir senha</h1>
      <ResetPasswordForm token={typeof token === "string" ? token : null} />
    </section>
  );
}
