import { Code2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BetaBadge } from "@/components/shared/beta-badge";
import { Wordmark } from "@/components/shared/wordmark";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { appVersion } from "@/lib/version";
import { LoginForm } from "./login-form";

export interface LoginScreenProps {
  /** Already validated by `safeNextPath`. */
  next: string;
}

/**
 * Home and login in one screen: the product with its illustration on the left, a curved edge, and
 * the login card on the right; on small screens a shorter product panel (no long paragraph) sits above the card.
 */
export function LoginScreen({ next }: LoginScreenProps) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-5">
      <section
        aria-label="Sobre o DevTrack"
        className="relative flex flex-col justify-center gap-6 overflow-hidden md:gap-8 bg-linear-to-br from-primary-subtle via-surface to-background px-6 py-10 md:px-12 lg:col-span-3 lg:py-12 lg:pr-16"
      >
        {/* Neon dashed curve in the corner, as decoration only. */}
        <svg aria-hidden="true" viewBox="0 0 200 120" className="pointer-events-none absolute -top-4 -left-4 w-48 fill-none stroke-info">
          <path d="M4 110 C 40 20, 120 100, 196 8" strokeWidth="4" strokeDasharray="14 12" strokeLinecap="round" />
        </svg>

        <p className="relative m-0 flex items-center gap-3">
          <span aria-hidden="true" className="flex rounded-md bg-primary p-2 text-primary-foreground">
            <Code2 className="size-6" />
          </span>
          <Wordmark size="lg" />
          <BetaBadge />
        </p>

        <div className="relative flex max-w-lg flex-col gap-3">
          <p className="m-0 text-h1 text-foreground">
            Ensine. Avalie. <span className="block text-primary">Acompanhe a evolução.</span>
          </p>
          <p className="m-0 text-h3 font-normal text-text-secondary">Menos respostas prontas. Mais aprendizado real.</p>
        </div>

        <Image
          src="/coding-workshop.svg"
          alt=""
          width={500}
          height={500}
          priority
          unoptimized
          className="relative mx-auto w-full max-w-48 md:max-w-sm lg:max-w-md"
        />

        <p className="relative m-0 hidden max-w-lg border-l-2 border-primary pl-4 text-body text-foreground md:block">
          Um ambiente para atividades e avaliações que ajuda professores a acompanhar como cada aluno pensa, resolve
          problemas e evolui.
        </p>

        {/* The curved edge between the panels (the reference's swoosh), filled with the page background. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 80 800"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-16 fill-background lg:block"
        >
          <path d="M80 0 H40 C 0 200, 70 360, 30 520 C 10 620, 40 720, 60 800 H80 Z" />
        </svg>
      </section>

      <div className="flex flex-col px-4 py-10 lg:col-span-2">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Card className="w-full max-w-sm border-t-2 border-t-primary shadow-overlay">
            <CardHeader className="gap-1">
              <h1 data-slot="card-title" className="m-0 text-h2">
                Entrar
              </h1>
              <p className="m-0 text-body-sm text-text-secondary">Acesse sua conta para continuar.</p>
            </CardHeader>
            <CardContent className="[&_button[type=submit]]:w-full">
              <LoginForm next={next} />
            </CardContent>
            {/* No signup link: students join through their teacher's class invitation (003 FR-048). */}
            <CardFooter className="justify-center text-body-sm">
              <Link href="/esqueci-senha">Esqueci minha senha</Link>
            </CardFooter>
          </Card>
          <p className="m-0 text-caption text-muted-foreground">Versão {appVersion()}</p>
        </div>
        <footer className="flex flex-col gap-1 pt-8 text-center text-caption text-muted-foreground">
          <p className="m-0">
            © {new Date().getFullYear()} · Desenvolvido por <span className="font-semibold">Nativecode</span>. Todos os
            direitos reservados.
          </p>
          <p className="m-0">
            <a href="https://storyset.com/web">Web illustrations by Storyset</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
