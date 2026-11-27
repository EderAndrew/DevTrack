import type { Metadata } from "next";
import { LoginScreen } from "@/features/auth/components/login-screen";
import { safeNextPath } from "@/lib/navigation";
import { SITE_DESCRIPTION } from "@/lib/seo/site";

// The one indexable page (`lib/seo/site.ts`): "/" redirects here, so it is the home in the search results.
export const metadata: Metadata = {
  title: "Entrar",
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/entrar" },
  robots: { index: true, follow: false },
  // A page's openGraph replaces the layout's whole object, so it repeats the site's fields.
  openGraph: { type: "website", siteName: "DevTrack", locale: "pt_BR", url: "/entrar", title: "DevTrack", description: SITE_DESCRIPTION },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <LoginScreen next={safeNextPath(typeof next === "string" ? next : null)} />;
}
