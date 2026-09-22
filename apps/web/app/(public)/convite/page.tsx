import type { Metadata } from "next";
import { getMe } from "../../../lib/session";
import { InvitationAcceptance } from "./invitation-acceptance";

/** The token must not leak to other sites through the Referer header (R7). */
export const metadata: Metadata = { title: "Convite", referrer: "no-referrer" };

export default async function InvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  // Only to tailor the SIGN_IN_REQUIRED screen; the API decides who may accept.
  const me = await getMe().catch(() => null);
  return (
    <section className="mx-auto max-w-160 px-4 py-8">
      <h1>Aceitar convite</h1>
      <InvitationAcceptance
        token={typeof token === "string" ? token : null}
        signedInAs={me ? { name: me.name, email: me.email } : null}
      />
    </section>
  );
}
