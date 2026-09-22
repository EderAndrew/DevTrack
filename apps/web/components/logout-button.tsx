"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authApi } from "../lib/auth-api";

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
    <button type="button" className="link-button" aria-busy={pending || undefined} onClick={() => void logout()}>
      Sair
    </button>
  );
}
