import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../../lib/session/session-provider";
import { getMe } from "../api/mobile-auth";

/** `GET /me` of the signed-in teacher: the theme (022) and the session check of every opening (FR-017). */
export function useMe() {
  const { status } = useSession();
  return useQuery({ queryKey: ["me"], queryFn: getMe, enabled: status === "signedIn" });
}
