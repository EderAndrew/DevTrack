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
        className="flex flex-col justify-center gap-10 bg-primary px-6 py-12 text-primary-foreground md:px-12"
      >
        <p className="m-0 text-display tracking-tight">DevTrack</p>
        <div className="flex max-w-md flex-col gap-3">
          <p className="m-0 text-h2">
            Ensine. Avalie. <span className="block">Acompanhe a evolução.</span>
          </p>
          <p className="m-0 text-h3 font-normal">Menos respostas prontas. Mais aprendizado real.</p>
        </div>
        <p className="m-0 max-w-md border-l-2 border-primary-foreground pl-4 text-body">
          Um ambiente para atividades e avaliações que ajuda professores a acompanhar como cada aluno pensa, resolve
          problemas e evolui.
        </p>
      </section>
      <div className="flex flex-col px-4 py-10">
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Card className="w-full max-w-sm">
            <CardHeader>
              <h1 data-slot="card-title" className="m-0 text-h2">
                Entrar
              </h1>
            </CardHeader>
            <CardContent className="[&_button[type=submit]]:w-full">
              <LoginForm next={next} />
            </CardContent>
            {/* No signup link: students join through their teacher's class invitation (003 FR-048). */}
            <CardFooter className="text-body-sm">
              <Link href="/esqueci-senha">Esqueci minha senha</Link>
            </CardFooter>
          </Card>
          <p className="m-0 text-caption text-muted-foreground">Versão {appVersion()}</p>
        </div>
        <footer className="pt-8 text-center text-caption text-muted-foreground">
          <p className="m-0">
            © {new Date().getFullYear()} · Desenvolvido por <span className="font-semibold">Nativecode</span>. Todos os
            direitos reservados.
          </p>
        </footer>
      </div>
    </div>
  );
}
