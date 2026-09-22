import type { Metadata } from "next";
import { VerifyEmail } from "./verify-email";

/** The token must not leak to other sites through the Referer header (R7). */
export const metadata: Metadata = { title: "Verificar e-mail", referrer: "no-referrer" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="page">
      <h1>Verificar e-mail</h1>
      <VerifyEmail token={typeof token === "string" ? token : null} />
    </section>
  );
}
