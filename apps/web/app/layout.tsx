import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { SiteNav } from "@/components/shared/site-nav";
import type { MeView } from "@repo/contracts";
import { getMe } from "@/features/auth/api/server";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: { default: "DevTrack", template: "%s · DevTrack" },
  description: "Plataforma de ensino e avaliação configurável por professor.",
};

/** The header only reflects the session for navigation; every decision is the API's. */
async function currentUser(): Promise<MeView | null> {
  try {
    return await getMe();
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const me = await currentUser();
  return (
    <html lang="pt-BR">
      <body className={geistSans.variable}>
        <Providers>
          <a className="skip-link" href="#conteudo">
            Pular para o conteúdo
          </a>
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-4">
            <Link href="/" className="font-bold text-foreground no-underline">
              DevTrack
            </Link>
            <SiteNav me={me} />
          </header>
          <main id="conteudo" tabIndex={-1}>
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
