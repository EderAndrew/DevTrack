import type { Metadata } from "next";
import { ResetPasswordScreen } from "@/features/auth/components/reset-password-screen";

/** The token must not leak to other sites through the Referer header (R7). */
export const metadata: Metadata = { title: "Redefinir senha", referrer: "no-referrer" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <ResetPasswordScreen token={typeof token === "string" ? token : null} />;
}
