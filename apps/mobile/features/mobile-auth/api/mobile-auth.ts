import { type MeView, MeViewSchema, type MobileLoginRequest, type MobileSession, MobileSessionSchema } from "@repo/contracts";
import { apiClient } from "../../../lib/api/instance";

/** 024 contracts/http-api.md: the app's sign-in (no session sent), sign-out and `GET /me`. */
export function signIn(body: MobileLoginRequest): Promise<MobileSession> {
  return apiClient().request("POST", "/auth/mobile/sessions", { body, schema: MobileSessionSchema, anonymous: true });
}

export function signOut(): Promise<void> {
  return apiClient().request("DELETE", "/auth/mobile/sessions/current");
}

export function getMe(): Promise<MeView> {
  return apiClient().request("GET", "/me", { schema: MeViewSchema });
}
