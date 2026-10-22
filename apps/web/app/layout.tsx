import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "./providers";
import "./globals.css";

// Self-hosted Latin subsets (SIL OFL 1.1, fonts/OFL.txt; research V5). Only Inter is preloaded.
// Faces with the same descriptors are tried last-declared first, so the latin file (which covers
// Portuguese) comes last and latin-ext only serves the characters it lacks.
const inter = localFont({
  src: [
    {
      path: "./fonts/inter-latin-ext-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "./fonts/inter-latin-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

const jetbrainsMono = localFont({
  src: [
    {
      path: "./fonts/jetbrains-mono-latin-ext-wght-normal.woff2",
      weight: "100 800",
      style: "normal",
    },
    {
      path: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
      weight: "100 800",
      style: "normal",
    },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
  preload: false,
});

// Fredoka (rounded) only for the DevTrack wordmark, which every frame shows (005 FR-005, amended 2026-10-22).
const fredoka = localFont({
  src: [
    {
      path: "./fonts/fredoka-latin-wght-normal.woff2",
      weight: "300 700",
      style: "normal",
    },
  ],
  variable: "--font-fredoka",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: { default: "DevTrack", template: "%s · DevTrack" },
  description: "Plataforma de ensino e avaliação configurável por professor.",
};

/**
 * Shell shared by every screen. Each route group brings its own frame and `<main id="conteudo">`:
 * `(auth)` none, `(public)` the site header, `(app)` the side menu (AppShell), `(student)` the
 * student layout and `(account)` either one, by the menu's permissions.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${fredoka.variable}`}>
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
