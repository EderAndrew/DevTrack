import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

/** Centered card with the product name above it; the screen shows no site header. */
export function ForgotPasswordScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <p className="m-0 text-4xl font-bold tracking-tight text-primary">DevTrack</p>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <h1 data-slot="card-title" className="m-0 text-2xl leading-tight font-semibold">
            Esqueci minha senha
          </h1>
          <CardDescription className="text-sm">
            Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link para definir uma nova senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="[&_button[type=submit]]:w-full">
          <ForgotPasswordForm />
        </CardContent>
        <CardFooter className="justify-center text-sm">
          <Link href="/entrar">Voltar para entrar</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
