import { redirect } from "next/navigation";
import { getMe } from "@/features/auth/api/server";
import { startPathFor } from "@/lib/navigation";

/**
 * Home and login are one screen (`/entrar`); with a session, the start page comes from the
 * account's permissions: "Minhas disciplinas" for a teacher, the profile otherwise. UX only.
 */
export default async function Home() {
  const me = await getMe().catch(() => null);
  redirect(me ? startPathFor(me.permissions) : "/entrar");
}
