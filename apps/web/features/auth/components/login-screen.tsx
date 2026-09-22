import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { appVersion } from "@/lib/version";
import { LoginForm } from "./login-form";

export interface LoginScreenProps {
  /** Already validated by `safeNextPath`. */
  next: string;
}

/** Home and login in one screen: the product on the left, the login card on the right. */
export function LoginScreen({ next }: LoginScreenProps) {
  return (
    <div className="grid min-h-dvh md:grid-cols-2">
      <section
        aria-label="Sobre o DevTrack"
        className="flex flex-col justify-center gap-3 bg-primary px-6 py-10 text-primary-foreground md:px-12"
      >
        <p className="m-0 text-4xl font-bold tracking-tight md:text-5xl">DevTrack</p>
        <p className="m-0 max-w-md text-lg md:text-xl">Plataforma de ensino e avaliação configurável por professor.</p>
      </section>
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-10">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <h1 data-slot="card-title" className="m-0 text-2xl leading-none font-semibold">
              Entrar
            </h1>
          </CardHeader>
          <CardContent className="[&_button[type=submit]]:w-full">
            <LoginForm next={next} />
          </CardContent>
          {/* No signup link: students will be invited by their teacher (future spec); /cadastro stays reachable. */}
          <CardFooter className="text-sm">
            <Link href="/esqueci-senha">Esqueci minha senha</Link>
          </CardFooter>
        </Card>
        <p className="m-0 text-xs text-muted-foreground">Versão {appVersion()}</p>
      </div>
    </div>
  );
}
