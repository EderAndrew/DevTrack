import Link from "next/link";
import { BetaBadge } from "@/components/shared/beta-badge";
import { Wordmark } from "@/components/shared/wordmark";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

/** Centered card with the product name above it, as "Esqueci minha senha"; the screen shows no site header. */
export function ResetPasswordScreen({ token }: { token: string | null }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <p className="m-0 flex items-center gap-3">
        <Wordmark size="lg" />
        <BetaBadge />
      </p>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <h1 data-slot="card-title" className="m-0 text-h2">
            Redefinir senha
          </h1>
        </CardHeader>
        <CardContent className="[&_button[type=submit]]:w-full">
          <ResetPasswordForm token={token} />
        </CardContent>
        <CardFooter className="justify-center text-body-sm">
          <Link href="/entrar">Voltar para entrar</Link>
        </CardFooter>
      </Card>
    </div>
  );
}
