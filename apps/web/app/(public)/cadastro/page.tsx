import type { Metadata } from "next";
import Link from "next/link";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignupPage() {
  return (
    <section className="mx-auto max-w-160 px-4 py-8">
      <h1>Criar conta de aluno</h1>
      <p>
        Professores e gestores recebem acesso por convite. Já tem conta? <Link href="/entrar">Entrar</Link>.
      </p>
      <SignupForm />
    </section>
  );
}
