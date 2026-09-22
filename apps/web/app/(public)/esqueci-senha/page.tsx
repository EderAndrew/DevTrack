import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return (
    <section className="page">
      <h1>Esqueci minha senha</h1>
      <p>Informe o e-mail da sua conta. Se ele estiver cadastrado, enviaremos um link para definir uma nova senha.</p>
      <ForgotPasswordForm />
      <p>
        <Link href="/entrar">Voltar para entrar</Link>
      </p>
    </section>
  );
}
