import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { getMe } from "@/features/auth/api/server";
import { ClassInvitationPage } from "@/features/class-invitations/components/class-invitation-page";

/** The token must not leak to other sites through the Referer header (001/R7, 003 D11). */
export const metadata: Metadata = { title: "Convite para turma", referrer: "no-referrer" };

export default async function ClassInvitationRoute({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  // Only to tailor the SIGN_IN_REQUIRED screen; the API decides who may accept.
  const me = await getMe().catch(() => null);
  return (
    <section className="mx-auto max-w-160 px-4 py-8">
      <PageHeader title="Convite para turma" />
      <ClassInvitationPage
        token={typeof token === "string" ? token : null}
        signedInAs={me ? { name: me.name, email: me.email } : null}
      />
    </section>
  );
}
