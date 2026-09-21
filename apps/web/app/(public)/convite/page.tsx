import type { Metadata } from "next";
import { InvitationAcceptance } from "./invitation-acceptance";

/** The token must not leak to other sites through the Referer header (R7). */
export const metadata: Metadata = { title: "Convite", referrer: "no-referrer" };

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <section className="page">
      <h1>Aceitar convite</h1>
      <InvitationAcceptance token={typeof token === "string" ? token : null} />
    </section>
  );
}
