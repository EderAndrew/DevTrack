import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { getMeForNavigation } from "@/features/auth/api/server";

/** Signed-in screens in the AppShell; the menu's collapsed choice is kept in the `sidebar_state` cookie. */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [me, cookieStore] = await Promise.all([getMeForNavigation(), cookies()]);
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return (
    <AppShell me={me} defaultOpen={defaultOpen}>
      {children}
    </AppShell>
  );
}
