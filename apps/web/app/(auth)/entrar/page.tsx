import type { Metadata } from "next";
import { LoginScreen } from "@/features/auth/components/login-screen";
import { safeNextPath } from "@/lib/navigation";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <LoginScreen next={safeNextPath(typeof next === "string" ? next : null)} />;
}
