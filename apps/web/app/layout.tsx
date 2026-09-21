import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { LogoutButton } from "../components/logout-button";
import { getMe, type MeView } from "../lib/session";
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
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        <header className="site-header">
          <Link href="/" className="brand">
            DevTrack
          </Link>
          <nav aria-label="Conta" className="site-nav">
            {me ? (
              <>
                <Link href="/conta/sessoes">Minhas sessões</Link>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/entrar">Entrar</Link>
                <Link href="/cadastro">Criar conta</Link>
              </>
            )}
          </nav>
        </header>
        <main id="conteudo" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
