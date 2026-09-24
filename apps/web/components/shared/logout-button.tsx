"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/features/auth/hooks/use-auth";

/**
 * Ends the current session. Whatever the API answers, the cache is dropped (FR-024) and the user
 * ends up on the login page.
 */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const logout = useLogout();

  const leave = () => {
    if (logout.isPending) return;
    logout.mutate(undefined, {
      onSettled: () => {
        router.replace("/entrar");
        router.refresh();
      },
    });
  };

  return (
    <Button type="button" variant="link" className={className} aria-busy={logout.isPending || undefined} onClick={leave}>
      <LogOut aria-hidden="true" />
      <span>Sair</span>
    </Button>
  );
}
