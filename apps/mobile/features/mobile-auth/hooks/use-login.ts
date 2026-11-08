import type { MobileLoginRequest } from "@repo/contracts";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "../../../lib/session/session-provider";
import { signIn } from "../api/mobile-auth";

/** Signs in and keeps the secret only in the secure store (024/FR-003). */
export function useLogin() {
  const session = useSession();
  return useMutation({
    mutationFn: async (body: MobileLoginRequest) => {
      const created = await signIn(body);
      await session.signIn(created.token);
      return created.user;
    },
  });
}
