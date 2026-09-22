import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "../../../lib/auth-api";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return (
    <section className="mx-auto max-w-160 px-4 py-8">
      <h1>Entrar</h1>
      <LoginForm next={safeNextPath(typeof next === "string" ? next : null)} />
      <p>
        <Link href="/esqueci-senha">Esqueci minha senha</Link>
      </p>
      <p>
        Ainda não tem conta? <Link href="/cadastro">Criar conta de aluno</Link>.
      </p>
    </section>
  );
}
