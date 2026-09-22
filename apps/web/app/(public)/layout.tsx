import { SiteHeader } from "@/components/shared/site-header";
import { SiteNav } from "@/components/shared/site-nav";
import { getMeForNavigation } from "@/features/auth/api/server";

/** Public screens reached from e-mail links (signup, verification, invitation, activation, reset). */
export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getMeForNavigation();
  return (
    <>
      <SiteHeader>
        <SiteNav me={me} />
      </SiteHeader>
      <main id="conteudo" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
