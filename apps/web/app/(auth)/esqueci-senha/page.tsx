import type { Metadata } from "next";
import { ForgotPasswordScreen } from "@/features/auth/components/forgot-password-screen";

export const metadata: Metadata = { title: "Esqueci minha senha" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />;
}
