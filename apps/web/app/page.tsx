import { redirect } from "next/navigation";
import { getMe } from "@/features/auth/api/server";
import { HOME_PATH } from "@/lib/navigation";

/** Home and login are one screen (`/entrar`); with a session, the start page is the account's. UX only. */
export default async function Home() {
  const me = await getMe().catch(() => null);
  redirect(me ? HOME_PATH : "/entrar");
}
