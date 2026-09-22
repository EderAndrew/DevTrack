"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/auth-api";

/** Ends the current session. Whatever the API answers, the user ends up on the login page. */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const logout = async () => {
    if (pending) return;
    setPending(true);
    try {
      await authApi.logout();
    } catch {
      // An already-ended session is fine: the goal is to leave.
    }
    router.replace("/entrar");
    router.refresh();
  };

  return (
    <Button type="button" variant="link" aria-busy={pending || undefined} onClick={() => void logout()}>
      <LogOut aria-hidden="true" />
      Sair
    </Button>
  );
}
