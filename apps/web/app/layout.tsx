import type { Metadata } from "next";
import localFont from "next/font/local";
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

/**
 * Shell shared by every screen. Each route group brings its own frame and `<main id="conteudo">`:
 * `(auth)` none, `(public)` the site header, `(app)` the side menu.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={geistSans.variable}>
        <Providers>
          <a className="skip-link" href="#conteudo">
            Pular para o conteúdo
          </a>
          {children}
        </Providers>
      </body>
    </html>
  );
}
