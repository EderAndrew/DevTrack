import { useMutation } from "@tanstack/react-query";
import { useSession } from "../../../lib/session/session-provider";
import { signOut } from "../api/mobile-auth";

/**
 * "Sair" (024/US1-4): the server revokes the session and deletes the device; the phone forgets the secret
 * and the cache even if the request fails (offline), so nothing stays signed in on the device.
 */
export function useLogout() {
  const session = useSession();
  return useMutation({
    mutationFn: async () => {
      try {
        await signOut();
      } finally {
        await session.signOut();
      }
    },
  });
}
